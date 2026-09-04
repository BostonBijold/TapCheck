"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerPushTokenForwarding } from "@/lib/native/routine-activity";
import { registerMissedListAlerts } from "@/lib/native/push-notifications";

// Wires up Live Activity push-token forwarding (see
// docs/features/live-activity.md) and missed-shift-list alert registration
// (see docs/features/notifications.md) on every native cold start, not
// just while Profile happens to be open — a token can arrive, or a
// permission prompt need showing, at any time. Used to also push the
// external API key into Keychain here for Shortcuts/Siri App Intents —
// removed along with that whole feature, see docs/features/nfc.md's
// history note.
export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    registerPushTokenForwarding();
    registerMissedListAlerts();
  }, []);

  return null;
}
