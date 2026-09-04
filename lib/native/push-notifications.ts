import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Ordinary remote-notification registration — the shift-window alert path
// (see docs/features/notifications.md: "time to start" and "missed"),
// distinct from lib/native/routine-activity.ts's Live Activity push token
// (ephemeral, tied to one running timer). This one is a persistent,
// standing per-device registration via the official Capacitor plugin,
// requested once per native cold start for any signed-in company user —
// both alert types have a manager audience, and "time to start" also
// reaches employees, so unlike the very first version of this feature
// there's no role check gating whether to prompt at all, only whether the
// user is attached to a company (checked via GET /api/session/role, the
// same narrow endpoint this always used).
//
// A denied/undetermined permission is not re-prompted on every launch,
// respecting the OS's own "don't be naggy" norms — see
// docs/features/notifications.md's "Device registration" step 4 for the
// in-app banner that's the actual re-prompt path for that case (not
// implemented here — this module only handles the native registration
// itself).
export async function registerAlertPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const roleRes = await fetch("/api/session/role");
    if (!roleRes.ok) return;
    const { companyId } = (await roleRes.json()) as { companyId: string | null };
    if (!companyId) return;

    let status = await PushNotifications.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== "granted") return;

    PushNotifications.addListener("registration", (token) => {
      console.log("[push] registration token received, forwarding to /api/push-tokens");
      fetch("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      })
        .then((res) => console.log(`[push] /api/push-tokens responded ${res.status}`))
        .catch((err) => console.error("[push] /api/push-tokens request failed", err));
    });

    // Previously unlistened-for — a native-side registration failure (no
    // APNs entitlement reachable, simulator, provisioning issue, etc.)
    // used to be completely silent: register() itself resolves regardless
    // of whether the OS ever actually hands back a token, so without this
    // listener there was no way to tell "the call completed" apart from
    // "and a token arrived" in the console.
    PushNotifications.addListener("registrationError", (err) => {
      console.error("[push] registrationError", JSON.stringify(err));
    });

    console.log("[push] permission granted, calling PushNotifications.register()");
    await PushNotifications.register();
  } catch (err) {
    // Best-effort — a failure here shouldn't block anything else on cold
    // start, same fire-and-forget spirit as registerPushTokenForwarding.
    // Still logged now, for the same reason as the listeners above.
    console.error("[push] registerAlertPushNotifications failed", err);
  }
}
