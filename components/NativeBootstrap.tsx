"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { registerPushTokenForwarding } from "@/lib/native/routine-activity";

// Wires up Live Activity push-token forwarding (see
// docs/features/live-activity.md) on every native cold start, not just
// while Profile happens to be open — a token can arrive at any time once a
// Live Activity starts. Used to also push the external API key into
// Keychain here for Shortcuts/Siri App Intents — removed along with that
// whole feature, see docs/features/nfc.md's history note.
export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    registerPushTokenForwarding();
  }, []);

  return null;
}
