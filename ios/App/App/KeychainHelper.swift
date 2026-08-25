import Foundation
import Security

// Backs the API key used by native App Intents code (ios/App/App/AppIntents)
// to authenticate to /api/external/* without the WebView. Written once from
// JS via ApiKeyBridgePlugin, read by TriggerHabitIntent/HabitEntityQuery.
//
// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, not the more commonly
// defaulted *WhenUnlocked* variant: an intent fired by a locked-phone NFC
// Automation needs to read this before the device is necessarily unlocked
// that session. WhenUnlocked* fails with errSecInteractionNotAllowed in
// exactly that case. ThisDeviceOnly keeps it out of encrypted backups.
enum KeychainHelper {
    private static let service = "com.bostonbijold.beone.apikey"
    private static let account = "apiKey"

    static func save(_ value: String) {
        let data = Data(value.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        let attributes: [String: Any] = query.merging([
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]) { _, new in new }

        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
