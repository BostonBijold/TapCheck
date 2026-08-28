import Capacitor
import CoreNFC

// An explicit, foreground, user-initiated NFC read — used to bind a task to
// a physical tag's raw UID from Manage Task List, and again to verify that
// UID when completing a linked task (see components/TaskFormScreen.tsx and
// components/TaskListEditView.tsx). Deliberately separate from this app's
// tap-to-trigger flow (Universal Links, never scans in-app — see
// docs/features/nfc.md's "Why not an in-app NFC listener instead"): that
// flow was ruled out for silent/background triggering because a Core NFC
// session can't survive backgrounding and is capped at 60 seconds. Neither
// limitation applies here — this only ever runs for a few seconds while the
// app is open and the user is actively tapping "Scan NFC".
@objc(NfcScanPlugin)
public class NfcScanPlugin: CAPPlugin, CAPBridgedPlugin, NFCTagReaderSessionDelegate {
    public let identifier = "NfcScanPlugin"
    public let jsName = "NfcScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
    ]

    private var session: NFCTagReaderSession?
    private var pendingCall: CAPPluginCall?

    @objc func scan(_ call: CAPPluginCall) {
        NSLog("[NfcScanPlugin] scan() called, readingAvailable=\(NFCTagReaderSession.readingAvailable)")
        guard NFCTagReaderSession.readingAvailable else {
            call.reject("NFC not available on this device")
            return
        }
        // Only one scan in flight at a time — a stray second call while a
        // sheet is already up just replaces the pending promise rather than
        // stacking sessions.
        session?.invalidate()
        pendingCall = call

        // .iso18092 (FeliCa) deliberately excluded — it requires a separate,
        // restricted entitlement Apple grants on request
        // (com.apple.developer.nfc.readersession.felica.systemcodes), not
        // part of standard NFC Tag Reading. Requesting it without that
        // approval throws NFCError code 2 ("Missing required entitlement")
        // for the whole session, even though .iso14443/.iso15693 alone would
        // have worked — confirmed by codesign/embedded.mobileprovision both
        // showing a correctly-authorized com.apple.developer.nfc.
        // readersession.formats entitlement, yet scanning still failing.
        // ISO14443 (MiFare/NTAG) covers the tags this feature is actually
        // meant for; add .iso18092 back only once FeliCa is separately
        // approved for this Team ID.
        let newSession = NFCTagReaderSession(pollingOption: [.iso14443, .iso15693], delegate: self, queue: nil)
        newSession?.alertMessage = "Hold your phone near the tag."
        session = newSession
        newSession?.begin()
        NSLog("[NfcScanPlugin] session.begin() called")
    }

    // Required by NFCTagReaderSessionDelegate — nothing to do here since
    // polling for a tag starts automatically once the session is active.
    public func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
        NSLog("[NfcScanPlugin] session became active — polling for a tag")
    }

    public func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        // Fires both for a genuine failure/cancel AND right after our own
        // success-path session.invalidate() call below — pendingCall is
        // already nil by then (cleared right after resolving), so this is a
        // no-op in the success case. Surface the REAL error (a missing
        // entitlement, an unsupported session, a user-tapped Cancel, a
        // timeout — these all look identical from JS otherwise, which makes
        // "I can't scan it" impossible to diagnose without this).
        let nsError = error as NSError
        NSLog("[NfcScanPlugin] didInvalidateWithError: domain=\(nsError.domain) code=\(nsError.code) desc=\(error.localizedDescription)")
        if let call = pendingCall {
            if let readerError = error as? NFCReaderError, readerError.code == .readerSessionInvalidationErrorUserCanceled {
                call.reject("Scan cancelled")
            } else {
                call.reject(error.localizedDescription)
            }
        }
        pendingCall = nil
        self.session = nil
    }

    public func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        NSLog("[NfcScanPlugin] didDetect \(tags.count) tag(s)")
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag detected")
            return
        }
        session.connect(to: tag) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                NSLog("[NfcScanPlugin] connect(to:) failed: \(error.localizedDescription)")
                session.invalidate(errorMessage: "Couldn't connect to tag")
                return
            }
            guard let uid = Self.uidHex(for: tag) else {
                NSLog("[NfcScanPlugin] uidHex(for:) returned nil for tag \(tag)")
                session.invalidate(errorMessage: "Couldn't read tag ID")
                return
            }
            NSLog("[NfcScanPlugin] read uid=\(uid)")
            session.alertMessage = "Done"
            let call = self.pendingCall
            self.pendingCall = nil
            session.invalidate()
            call?.resolve(["uid": uid])
        }
    }

    // Every NFCTag case exposes the tag's raw hardware identifier under a
    // different property name — normalized here to one lowercase hex string.
    private static func uidHex(for tag: NFCTag) -> String? {
        let data: Data?
        switch tag {
        case .miFare(let t): data = t.identifier
        case .iso15693(let t): data = t.identifier
        case .iso7816(let t): data = t.identifier
        case .feliCa(let t): data = t.currentIDm
        @unknown default: data = nil
        }
        guard let data = data, !data.isEmpty else { return nil }
        return data.map { String(format: "%02x", $0) }.joined()
    }
}
