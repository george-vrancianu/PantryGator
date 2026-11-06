import AppIntents
import Foundation

/// "Hey Siri, PantryGator needs / got / do we have": Siri asks for the words, the app posts them as an
/// Assistant Request (ADR 0038) and Siri speaks the reply. Each intent is thin: it only names its prefix
/// (see `AssistantRequest.Prefix`, the same text the Gator Shortcuts in docs/siri-shortcut.md send); the
/// request, the reply and the fixed failure replies are shared in `AssistantRequest`. They read the
/// Keychain item themselves, so the secret never passes through JavaScript.
/// None opens the app (`openAppWhenRun` false). `supportedModes` (iOS 26, which deprecates
/// `openAppWhenRun`) is deferred: it needs `#if compiler(>=6.2)` plus `@available(iOS 26.0, *)` so older
/// Xcode versions still build. `openAppWhenRun = false` alone is expected to keep the app closed on
/// iOS 26 (a device check).
struct GatorNeedsIntent: AppIntent {
    static let title: LocalizedStringResource = "Gator needs"
    static let description = IntentDescription("Add what you need to your Shopping List.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Items", requestValueDialog: IntentDialog("What do you need?"))
    var items: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await AssistantRequest.send(prefix: AssistantRequest.Prefix.needs, text: items)
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct GatorGotIntent: AppIntent {
    static let title: LocalizedStringResource = "Gator got"
    static let description = IntentDescription("Tick off what you got from your Shopping List.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Items", requestValueDialog: IntentDialog("What did you get?"))
    var items: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await AssistantRequest.send(prefix: AssistantRequest.Prefix.got, text: items)
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct GatorDoWeHaveIntent: AppIntent {
    static let title: LocalizedStringResource = "Gator, do we have"
    static let description = IntentDescription("Ask whether you have something in your Pantry or on your Shopping List.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Items", requestValueDialog: IntentDialog("What are you looking for?"))
    var items: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await AssistantRequest.send(prefix: AssistantRequest.Prefix.doWeHave, text: items)
        return .result(dialog: IntentDialog(stringLiteral: reply))
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
        AppShortcut(
            intent: GatorGotIntent(),
            phrases: ["\(.applicationName) got"],
            shortTitle: "Gator got",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: GatorDoWeHaveIntent(),
            phrases: ["\(.applicationName), do we have"],
            shortTitle: "Gator, do we have",
            systemImageName: "questionmark.circle"
        )
    }
}

/// Posts a dictated command to the Assistant Request endpoint and returns what Siri should say.
/// A reply with `speech` is spoken as it is, whatever the status. Without one: 401 means the commands
/// are switched off (the token was revoked or is unknown); anything else (no network, a bad body, a
/// server error) means PantryGator could not be reached. The fixed replies go through
/// `String(localized:defaultValue:)`; Localizable.xcstrings translates them (en, ro, da) by the phone's language.
enum AssistantRequest {
    /// What each command puts before the dictated words (docs/siri-shortcut.md, "The Gator Shortcuts").
    enum Prefix {
        static let needs = "Add to the shopping list: "
        static let got = "Got "
        static let doWeHave = "Do we have "
    }

    static let notOnReply = String(
        localized: "siri.reply.notOn", defaultValue: "Turn on Siri in PantryGator Settings.")
    static let switchedOffReply = String(
        localized: "siri.reply.switchedOff",
        defaultValue: "PantryGator voice commands are off. Turn on Siri in PantryGator Settings.")
    static let unreachableReply = String(
        localized: "siri.reply.unreachable", defaultValue: "PantryGator couldn't be reached. Try again.")
    static let lockedReply = String(
        localized: "siri.reply.locked", defaultValue: "Unlock your phone once, then try again.")

    static func send(prefix: String, text: String) async -> String {
        let credentials: SiriCredentials
        switch SiriKeychain.read() {
        case .found(let found): credentials = found
        case .notFound: return notOnReply
        case .locked: return lockedReply
        }
        guard let url = URL(string: credentials.apiOrigin + "/api/assistant/requests") else {
            return unreachableReply
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
            let (data, response) = try await URLSession.shared.data(for: request)
            if let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let speech = body["speech"] as? String, !speech.isEmpty {
                return speech
            }
            if (response as? HTTPURLResponse)?.statusCode == 401 {
                return switchedOffReply
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
