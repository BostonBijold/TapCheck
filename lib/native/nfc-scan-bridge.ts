import { registerPlugin } from "@capacitor/core";

// Bridges to ios/App/App/NfcScanPlugin.swift — an explicit, foreground,
// user-initiated NFC read (distinct from the tap-to-trigger Universal Link
// flow in lib/task-trigger.ts, which never scans in-app — see
// docs/features/nfc.md's "Why not an in-app NFC listener instead" and its
// follow-up "In-app scan-to-complete binding" section). No-op-safe to call
// on web/PWA: registerPlugin resolves to a stub there that rejects every
// call, and lib/native/nfc-scan.ts additionally guards with
// Capacitor.isNativePlatform() before ever calling it.
interface NfcScanPlugin {
  // Resolves once a tag is detected and read; uid is lowercase hex of the
  // tag's raw identifier bytes. Rejects if the user cancels the system NFC
  // sheet, the read times out, or the device has no NFC hardware.
  scan(): Promise<{ uid: string }>;
}

export const NfcScan = registerPlugin<NfcScanPlugin>("NfcScan");
