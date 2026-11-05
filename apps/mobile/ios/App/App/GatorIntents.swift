import AppIntents
import Foundation

/// "Hey Siri, PantryGator needs": Siri asks what you need, the app posts it as an Assistant Request
/// (ADR 0038) and Siri speaks the reply. Thin by design: the prefix and the fixed failure replies are
/// all it knows. It reads the Keychain item itself, so the secret never passes through JavaScript.
/// It does not open the app (`openAppWhenRun` false). `supportedModes` (iOS 26) is not set: it cannot be
/// written to compile on older SDKs, and a non-foreground intent already stays in the background.
struct GatorNeedsIntent: AppIntent {
    static let title: LocalizedStringResource = "Gator needs"
    static let description = IntentDescription("Add what you need to your Shopping List.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Items", requestValueDialog: IntentDialog("What do you need?"))
    var items: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await AssistantRequest.send(prefix: "Add to the shopping list: ", text: items)
        return .result(dialog: "\(reply)")
    }
}

struct GatorShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: GatorNeedsIntent(),
            phrases: ["\(.applicationName) needs"],
            shortTitle: "Gator needs",
            systemImageName: "cart"
        )
    }
}

/// Posts a dictated command to the Assistant Request endpoint and returns what Siri should say.
enum AssistantRequest {
    static let notOnReply = "Turn on Siri in PantryGator Settings."
    static let unreachableReply = "PantryGator couldn't be reached. Try again."

    static func send(prefix: String, text: String) async -> String {
        guard let credentials = SiriKeychain.load(),
              let url = URL(string: credentials.apiOrigin + "/api/assistant/requests") else {
            return notOnReply
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + credentials.secret, forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "text": prefix + text,
            "today": localDate(),
        ])
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let speech = body["speech"] as? String, !speech.isEmpty {
                return speech
            }
            return unreachableReply
        } catch {
            return unreachableReply
        }
    }

    /// The phone's local calendar date, YYYY-MM-DD.
    private static func localDate() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
