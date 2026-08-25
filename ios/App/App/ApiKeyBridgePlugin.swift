import Capacitor
import Foundation

// First custom native plugin in this project — everything else so far
// (Universal Links) rides on stock @capacitor/app. Pure-Swift, no separate
// .m bridge needed: conforming to CAPBridgedPlugin alongside CAPPlugin is
// Capacitor 5+'s pattern for plugins compiled directly into the app target.
// Explicitly registered too, in MainViewController.capacitorDidLoad — see
// the comment there for why.
//
// Exists solely to get the web-fetched API key into Keychain, where the
// App Intents code (ios/App/App/AppIntents) can read it independent of the
// WebView. See docs/features/app-intents.md.
@objc(ApiKeyBridgePlugin)
public class ApiKeyBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApiKeyBridgePlugin"
    public let jsName = "ApiKeyBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setApiKey", returnType: CAPPluginReturnPromise)
    ]

    @objc func setApiKey(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey"), !apiKey.isEmpty else {
            call.reject("Missing apiKey")
            return
        }
        KeychainHelper.save(apiKey)
        call.resolve()
    }
}
