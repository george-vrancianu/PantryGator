import Capacitor

/// The app's bridge view controller. It is the custom class in Main.storyboard, and SceneDelegate also
/// creates it in code as the window's root view controller. Capacitor 8 finds
/// plugins from SPM packages itself; plugins of our own are registered here.
class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SiriKeychainPlugin())
    }
}
