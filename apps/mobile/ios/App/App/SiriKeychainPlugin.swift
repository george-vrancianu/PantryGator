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
        if case .found(let credentials) = read() { return credentials }
        return nil
    }

    /// What reading the item found. `locked` is a Keychain that cannot be read right now (before the first
    /// unlock after a restart), which is not the same as nothing being stored.
    enum Read {
        case found(SiriCredentials)
        case notFound
        case locked
    }

    static func read() -> Read {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecInteractionNotAllowed { return .locked }
        guard status == errSecSuccess,
              let data = result as? Data,
              let credentials = try? JSONDecoder().decode(SiriCredentials.self, from: data) else {
            return .notFound
        }
        return .found(credentials)
    }

    /// Stores `apiOrigin` in the item and keeps the rest. Does nothing when nothing can be read.
    static func updateApiOrigin(_ apiOrigin: String) throws {
        guard let credentials = load() else { return }
        try save(
            SiriCredentials(
                secret: credentials.secret, tokenId: credentials.tokenId,
                memberId: credentials.memberId, apiOrigin: apiOrigin))
    }

    /// True when the item is gone: deleted, or there was none. False when the Keychain refused.
    @discardableResult
    static func clear() -> Bool {
        let status = SecItemDelete(identity as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

/// Capacitor plugin `SiriKeychain`: set, clear, get and updateApiOrigin. `get` never returns the secret.
@objc(SiriKeychainPlugin)
public class SiriKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SiriKeychainPlugin"
    public let jsName = "SiriKeychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateApiOrigin", returnType: CAPPluginReturnPromise),
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
        call.resolve([
            "tokenId": credentials.tokenId, "memberId": credentials.memberId,
            "apiOrigin": credentials.apiOrigin,
        ])
    }

    @objc func updateApiOrigin(_ call: CAPPluginCall) {
        guard let apiOrigin = call.getString("apiOrigin") else {
            call.reject("Must provide apiOrigin")
            return
        }
        do {
            try SiriKeychain.updateApiOrigin(apiOrigin)
            call.resolve()
        } catch {
            call.reject("Could not update the API origin", nil, error)
        }
    }
}
