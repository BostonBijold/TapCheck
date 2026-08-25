import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        self.webView?.scrollView.bounces = false
    }

    // Explicit registration for ApiKeyBridgePlugin — a plugin compiled
    // directly into the app target, not shipped via SPM/npm like the stock
    // Capacitor plugins. Belt-and-suspenders alongside its CAPBridgedPlugin
    // conformance (which should auto-discover it, but this guarantees
    // registration regardless). See docs/features/app-intents.md.
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ApiKeyBridgePlugin())
    }
}
