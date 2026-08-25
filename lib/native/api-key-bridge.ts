import { registerPlugin } from "@capacitor/core";

// Bridges to ios/App/App/ApiKeyBridgePlugin.swift, which writes the key to
// Keychain so native App Intents code can authenticate to /api/external/*
// without the WebView. No-op-safe to call on web/PWA — registerPlugin
// resolves to a stub there, and call sites additionally guard with
// Capacitor.isNativePlatform() before calling setApiKey. See
// docs/features/app-intents.md.
interface ApiKeyBridgePlugin {
  setApiKey(options: { apiKey: string }): Promise<void>;
}

export const ApiKeyBridge = registerPlugin<ApiKeyBridgePlugin>("ApiKeyBridge");
