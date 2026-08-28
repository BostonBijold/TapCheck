import { Capacitor } from "@capacitor/core";
import { NfcScan } from "@/lib/native/nfc-scan-bridge";

export type NfcScanResult =
  | { status: "ok"; uid: string }
  | { status: "unsupported" } // web/PWA, or no NFC hardware
  // User backed out of the system sheet, or the read failed/timed out.
  // message is NfcScanPlugin.swift's real error.localizedDescription (e.g.
  // "Missing 'com.apple.developer.nfc.readersession.formats' entitlement")
  // rather than a generic string, so a real failure is visible in the UI
  // without needing device console logs to diagnose.
  | { status: "cancelled"; message: string };

// Thin, always-safe wrapper around lib/native/nfc-scan-bridge.ts, same
// shape as lib/native/routine-activity.ts's wrappers — every call site
// (TaskFormScreen.tsx, TaskListEditView.tsx) just calls this directly with
// no Capacitor.isNativePlatform() guard or try/catch of its own.
export async function scanNfcTag(): Promise<NfcScanResult> {
  if (!Capacitor.isNativePlatform()) return { status: "unsupported" };
  try {
    const { uid } = await NfcScan.scan();
    return { status: "ok", uid: uid.toLowerCase() };
  } catch (err) {
    return { status: "cancelled", message: err instanceof Error ? err.message : "Scan cancelled" };
  }
}
