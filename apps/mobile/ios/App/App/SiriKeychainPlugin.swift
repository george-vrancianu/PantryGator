import Foundation
import Security
import Capacitor

/// The phone's Assistant Token for Siri (ADR 0038): one Keychain item holding the secret, the token id,
/// the Member id and the API origin. Readable after the first unlock (so Siri works on a locked phone)
/// and never copied to another device. Shared by the Capacitor plugin below and the App Intents.
struct SiriCredentials: Codable {
    let secret: String
    let tokenId: String
    let memberId: String
    let apiOrigin: String
}

enum SiriKeychain {
    private static let service = "ro.vrancianu.pantrygator.siri"
    private static let account = "assistant-token"

    private static var identity: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ credentials: SiriCredentials) throws {
        let data = try JSONEncoder().encode(credentials)
        SecItemDelete(identity as CFDictionary)
        var item = identity
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    /// Nil when nothing is stored (or it cannot be read).
    static func load() -> SiriCredentials? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(SiriCredentials.self, from: data)
    }

    static func clear() {
        SecItemDelete(identity as CFDictionary)
    }
}

/// Capacitor plugin `SiriKeychain`: set, clear and get. `get` never returns the secret.
@objc(SiriKeychainPlugin)
public class SiriKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SiriKeychainPlugin"
    public let jsName = "SiriKeychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        guard let secret = call.getString("secret"),
              let tokenId = call.getString("tokenId"),
              let memberId = call.getString("memberId"),
              let apiOrigin = call.getString("apiOrigin") else {
            call.reject("Must provide secret, tokenId, memberId and apiOrigin")
            return
        }
        do {
            try SiriKeychain.save(
                SiriCredentials(secret: secret, tokenId: tokenId, memberId: memberId, apiOrigin: apiOrigin))
            call.resolve()
        } catch {
            call.reject("Could not store the token", nil, error)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        SiriKeychain.clear()
        call.resolve()
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let credentials = SiriKeychain.load() else {
            call.resolve([:])
            return
        }
        call.resolve(["tokenId": credentials.tokenId, "memberId": credentials.memberId])
    }
}
