import { Capacitor } from "@capacitor/core";
import { NfcScan } from "@/lib/native/nfc-scan-bridge";

export type NfcScanResult =
  | { status: "ok"; uid: string }
  | { status: "unsupported" } // web/PWA, or no NFC hardware
  | { status: "cancelled" };  // user backed out of the system sheet, or the read failed/timed out

// Thin, always-safe wrapper around lib/native/nfc-scan-bridge.ts, same
// shape as lib/native/routine-activity.ts's wrappers — every call site
// (TaskFormScreen.tsx, TaskListEditView.tsx) just calls this directly with
// no Capacitor.isNativePlatform() guard or try/catch of its own.
export async function scanNfcTag(): Promise<NfcScanResult> {
  if (!Capacitor.isNativePlatform()) return { status: "unsupported" };
  try {
    const { uid } = await NfcScan.scan();
    return { status: "ok", uid: uid.toLowerCase() };
  } catch {
    return { status: "cancelled" };
  }
}
