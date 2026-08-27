"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ApiKeyBridge } from "@/lib/native/api-key-bridge";
import { registerPushTokenForwarding } from "@/lib/native/routine-activity";

// Pushes the API key into Keychain (see docs/features/app-intents.md) on
// every native cold start, not just when the user happens to open Profile —
// otherwise a Shortcuts/Siri App Intent invoked before a first Profile
// visit would find nothing in Keychain to authenticate with. Also wires up
// Live Activity push-token forwarding (see docs/features/live-activity.md)
// every cold start, for the same reason — a token can arrive at any time
// once a Live Activity starts, not just while Profile happens to be open.
export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    fetch("/api/user/api-key")
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        if (data.apiKey) ApiKeyBridge.setApiKey({ apiKey: data.apiKey }).catch(() => {});
      })
      .catch(() => {});

    registerPushTokenForwarding();
  }, []);

  return null;
}
