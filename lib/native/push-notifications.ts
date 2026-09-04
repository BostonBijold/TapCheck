import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Ordinary remote-notification registration — the missed-shift-list alert
// path (see docs/features/notifications.md), distinct from
// lib/native/routine-activity.ts's Live Activity push token (ephemeral,
// tied to one running timer). This one is a persistent, standing
// per-device registration via the official Capacitor plugin, requested
// once per native cold start for a manager only — employees don't receive
// these alerts in v1, so there's no reason to show them the OS permission
// prompt at all.
//
// A denied/undetermined permission is not re-prompted on every launch,
// respecting the OS's own "don't be naggy" norms — see
// docs/features/notifications.md's "Device registration" step 4 for the
// in-app banner that's the actual re-prompt path for that case (not
// implemented here — this module only handles the native registration
// itself).
export async function registerMissedListAlerts() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const roleRes = await fetch("/api/session/role");
    if (!roleRes.ok) return;
    const { role } = (await roleRes.json()) as { role: string | null };
    if (role !== "manager") return;

    let status = await PushNotifications.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== "granted") return;

    PushNotifications.addListener("registration", (token) => {
      fetch("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      }).catch(() => {});
    });

    await PushNotifications.register();
  } catch {
    // Best-effort — a failure here shouldn't block anything else on cold
    // start, same fire-and-forget spirit as registerPushTokenForwarding.
  }
}
