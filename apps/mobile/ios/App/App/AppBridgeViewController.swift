import Capacitor

/// The app's bridge view controller (set as the custom class in Main.storyboard). Capacitor 8 finds
/// plugins from SPM packages itself; plugins of our own are registered here.
class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SiriKeychainPlugin())
    }
}
