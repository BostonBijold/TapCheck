import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Was CAPBridgeViewController() directly — meaning MainViewController's
        // overrides (scroll-bounce disable, and now the App Intents plugin
        // registration in capacitorDidLoad) never actually ran. Found via a
        // diagnostic session where os_log(.fault)/stderr/stdout writes in
        // viewDidLoad produced zero output through any capture mechanism,
        // in a fully non-stub, traditionally-linked build — the only
        // explanation left was that the class was never instantiated at all.
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // Universal Link continuation entry point (see docs/features/nfc.md's
    // "Native setup"). SceneDelegateProxy (from @capacitor/app) only
    // broadcasts a native notification here — it never touches the WebView
    // itself. UniversalLinkHandler.tsx listens for that as the JS
    // "appUrlOpen" event and does the actual navigation.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
