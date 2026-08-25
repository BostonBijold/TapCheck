"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ApiKeyBridge } from "@/lib/native/api-key-bridge";

// Pushes the API key into Keychain (see docs/features/app-intents.md) on
// every native cold start, not just when the user happens to open Profile —
// otherwise a Shortcuts/Siri App Intent invoked before a first Profile
// visit would find nothing in Keychain to authenticate with.
export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    fetch("/api/user/api-key")
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        if (data.apiKey) ApiKeyBridge.setApiKey({ apiKey: data.apiKey }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  return null;
}
