import Capacitor
import Foundation

// First custom native plugin in this project — everything else so far
// (Universal Links) rides on stock @capacitor/app. Pure-Swift, no separate
// .m bridge needed: conforming to CAPBridgedPlugin alongside CAPPlugin is
// Capacitor 5+'s pattern for plugins compiled directly into the app target,
// auto-discovered at bridge init via runtime introspection — no
// capacitor.config entry or manual registration required.
//
// Exists solely to get the web-fetched API key into Keychain, where the
// App Intents code (ios/App/App/AppIntents) can read it independent of the
// WebView. See docs/features/app-intents.md.
@objc(ApiKeyBridgePlugin)
public class ApiKeyBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApiKeyBridgePlugin"
    public let jsName = "ApiKeyBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setApiKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugReadKey", returnType: CAPPluginReturnPromise),
    ]

    @objc func setApiKey(_ call: CAPPluginCall) {
        NSLog("[BeOne] ApiKeyBridgePlugin.setApiKey called")
        guard let apiKey = call.getString("apiKey"), !apiKey.isEmpty else {
            NSLog("[BeOne] ApiKeyBridgePlugin.setApiKey missing/empty apiKey")
            call.reject("Missing apiKey")
            return
        }
        NSLog("[BeOne] ApiKeyBridgePlugin.setApiKey got key, length \(apiKey.count)")
        KeychainHelper.save(apiKey)
        call.resolve()
    }

    // Temporary diagnostic — reads back via the exact same KeychainHelper.load()
    // TriggerHabitIntent uses, so a visible on-screen result here proves both
    // plugin discovery and the Keychain round-trip work end to end. Remove
    // once the "not signed in" Shortcuts issue is resolved.
    @objc func debugReadKey(_ call: CAPPluginCall) {
        let key = KeychainHelper.load()
        call.resolve([
            "hasKey": key != nil,
            "length": key?.count ?? 0,
        ])
    }
}
