import { SignJWT, importPKCS8 } from "jose";
import http2 from "node:http2";

// Sends Live Activity push updates directly to Apple's push servers — the
// mechanism that lets the Lock Screen card update while the app itself
// isn't running (NFC/Shortcuts triggers, the Lock Screen "Done" button).
// See docs/features/live-activity.md's "Push-driven updates" section.
//
// Same underlying infrastructure (APNs Auth Key, provider JWT, this HTTP/2
// client) would back ordinary push notifications too, if this app ever adds
// those — the content-state/push-type details below are specific to Live
// Activities, everything else here is reusable.

// Matches ios/App/RoutineActivity/RoutineActivityAttributes.swift's
// ContentState exactly — key names AND shape, since APNs delivers this
// verbatim to the device for ActivityKit to decode. startedAt is seconds
// since 1970 (a plain number), not an ISO string: Swift's Codable default
// (deferredToDate) for Date, which the struct doesn't override.
export interface RoutineActivityContentState {
  routineLabel: string;
  habitName: string;
  startedAt: number;
  projectedMinutes: number;
  routineItemId: string;
  routineGroupId: string | null;
}

const BUNDLE_ID = "com.bostonbijold.beone";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var — see docs/features/live-activity.md`);
  return value;
}

// A fresh provider JWT per call — Apple's guidance against over-generating
// is aimed at services sending thousands of pushes/sec reusing one token
// for up to an hour; this app sends at most a handful of pushes a day, so
// the added complexity of caching across serverless invocations (which
// can't reliably persist in-memory state anyway) isn't worth it.
async function signProviderToken(): Promise<string> {
  const teamId = requireEnv("APNS_TEAM_ID");
  const keyId = requireEnv("APNS_KEY_ID");
  const privateKeyPem = requireEnv("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");

  const key = await importPKCS8(privateKeyPem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuedAt()
    .setIssuer(teamId)
    .sign(key);
}

interface LiveActivityPushOptions {
  pushToken: string;
  environment: "sandbox" | "production";
  event: "update" | "end";
  contentState: RoutineActivityContentState;
}

// One HTTP/2 connection per call — simple and correct at this app's volume
// (a personal, single-user app), not optimized for the connection-reuse
// APNs expects from a high-throughput provider.
export async function sendLiveActivityPush({
  pushToken,
  environment,
  event,
  contentState,
}: LiveActivityPushOptions): Promise<void> {
  const token = await signProviderToken();
  const host =
    environment === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";

  const payload: Record<string, unknown> = {
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event,
      "content-state": contentState,
    },
  };
  if (event === "end") {
    (payload.aps as Record<string, unknown>)["dismissal-date"] = Math.floor(Date.now() / 1000);
  }
  const body = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    const session = http2.connect(host);
    session.on("error", (err) => {
      session.close();
      reject(err);
    });

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": `${BUNDLE_ID}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let responseBody = "";
    let status: number | undefined;
    req.on("response", (headers) => {
      status = headers[":status"] as number;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      session.close();
      if (status === 200) {
        resolve();
      } else {
        reject(new Error(`APNs push failed: status ${status}, body ${responseBody}`));
      }
    });
    req.on("error", (err) => {
      session.close();
      reject(err);
    });

    req.write(body);
    req.end();
  });
}
