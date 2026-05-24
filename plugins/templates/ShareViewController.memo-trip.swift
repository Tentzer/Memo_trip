/*!
 * Memo Trip share extension: queue reel import on Supabase without opening the main app.
 */
import UIKit
import Social

class ShareViewController: UIViewController {
  let hostAppGroupIdentifier = "<GROUPIDENTIFIER>"
  let shareProtocol = "<SCHEME>"
  let sharedKey = "<SCHEME>ShareKey"
  let supabaseImportEndpoint = "<SUPABASE_IMPORT_URL>"
  let supabaseAnonKey = "<SUPABASE_ANON_KEY>"
  let shareExtensionAuthKey = "memoTripSupabaseAccessToken"
  let directImportTextKey = "memoTripShareText"
  let directImportWebUrlKey = "memoTripShareWebUrl"
  let directImportHandoffUrlKey = "memoTripLastDirectImportUrl"
  let directImportHandoffAtKey = "memoTripDirectImportAt"

  private let sheetTag = 9001
  private let accentColor = UIColor(red: 37 / 255, green: 99 / 255, blue: 235 / 255, alpha: 1)
  private var pendingVideoUrl: String?

  private struct ShareWebUrlPayload: Codable {
    let url: String
    let meta: String
  }

  private enum HostRedirectType: String {
    case text
    case weburl
  }

  private enum DirectImportOutcome {
    case success
    case notSignedIn
    case failed(String)
  }

  private var prefersRtlInterface: Bool {
    guard let language = Locale.preferredLanguages.first?.lowercased() else { return false }
    return language.hasPrefix("he") || language.hasPrefix("ar")
  }

  private struct ShareSheetCopy {
    let title: String
    let message: String
    let primary: String
    let secondary: String?
  }

  private func copyImportStarted() -> ShareSheetCopy {
    if prefersRtlInterface {
      return ShareSheetCopy(
        title: "הייבוא התחיל",
        message: "הריל שלך מיובא. פתח/י את Memo Trip בכל עת כדי לראות מקומות במפה.",
        primary: "אישור",
        secondary: nil
      )
    }
    return ShareSheetCopy(
      title: "Import started",
      message: "Your reel is being imported. Open Memo Trip anytime to see places on your map.",
      primary: "OK",
      secondary: nil
    )
  }

  private func copySignInRequired() -> ShareSheetCopy {
    if prefersRtlInterface {
      return ShareSheetCopy(
        title: "נדרשת התחברות",
        message: "פתח/י את Memo Trip פעם אחת והתחבר/י. לאחר מכן ניתן לייבא רילים ישירות מכאן.",
        primary: "פתיחת Memo Trip",
        secondary: "ביטול"
      )
    }
    return ShareSheetCopy(
      title: "Sign in required",
      message: "Open Memo Trip once and sign in. After that, shared reels import from here.",
      primary: "Open Memo Trip",
      secondary: "Cancel"
    )
  }

  private func copyImportFailed(reason: String) -> ShareSheetCopy {
    if prefersRtlInterface {
      return ShareSheetCopy(
        title: "הייבוא נכשל",
        message: reason,
        primary: "פתיחת Memo Trip",
        secondary: "סגירה"
      )
    }
    return ShareSheetCopy(
      title: "Import failed",
      message: reason,
      primary: "Open Memo Trip",
      secondary: "Dismiss"
    )
  }

  private func copyNoVideoLink() -> ShareSheetCopy {
    if prefersRtlInterface {
      return ShareSheetCopy(
        title: "לא נמצא קישור לסרטון",
        message: "Memo Trip לא הצליחה לקרוא קישור לריל מהשיתוף הזה.",
        primary: "פתיחת Memo Trip",
        secondary: "ביטול"
      )
    }
    return ShareSheetCopy(
      title: "No video link found",
      message: "Memo Trip could not read a reel link from this share.",
      primary: "Open Memo Trip",
      secondary: "Cancel"
    )
  }

  private func copyGenericError(_ message: String) -> ShareSheetCopy {
    if prefersRtlInterface {
      return ShareSheetCopy(
        title: "משהו השתבש",
        message: message,
        primary: "אישור",
        secondary: nil
      )
    }
    return ShareSheetCopy(
      title: "Something went wrong",
      message: message,
      primary: "OK",
      secondary: nil
    )
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    view.isOpaque = false
    preferredContentSize = CGSize(width: 0, height: 1)
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    Task { await self.processShare() }
  }

  private func processShare() async {
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem else {
      await dismissWithError("No share content")
      return
    }

    var texts: [String] = []
    if let t = item.attributedContentText?.string, !t.isEmpty { texts.append(t) }
    if let t = item.attributedTitle?.string, !t.isEmpty { texts.append(t) }

    let urlType = "public.url"
    let textType = "public.plain-text"
    if let attachments = item.attachments {
      for attachment in attachments {
        if attachment.hasItemConformingToTypeIdentifier(urlType),
           let urlItem = try? await attachment.loadItem(forTypeIdentifier: urlType) as? URL {
          texts.append(urlItem.absoluteString)
        } else if attachment.hasItemConformingToTypeIdentifier(urlType),
                  let urlStr = try? await attachment.loadItem(forTypeIdentifier: urlType) as? String {
          texts.append(urlStr)
        } else if attachment.hasItemConformingToTypeIdentifier(textType),
                  let text = try? await attachment.loadItem(forTypeIdentifier: textType) as? String {
          texts.append(text)
        }
      }
    }

    let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
    if !texts.isEmpty {
      ud?.set(texts, forKey: directImportTextKey)
      ud?.synchronize()
    }

    guard let videoUrl = extractVideoUrl(from: texts.joined(separator: "\n")) else {
      await presentNoVideoLink()
      return
    }

    pendingVideoUrl = videoUrl
    attemptDirectImport(videoUrl: videoUrl)
  }

  private func attemptDirectImport(videoUrl: String) {
    attemptDirectVideoImport(urlString: videoUrl) { [weak self] outcome in
      guard let self = self else { return }
      DispatchQueue.main.async {
        switch outcome {
        case .success:
          let ud = UserDefaults(suiteName: self.hostAppGroupIdentifier)
          ud?.set(videoUrl, forKey: self.directImportHandoffUrlKey)
          ud?.set(Date().timeIntervalSince1970, forKey: self.directImportHandoffAtKey)
          ud?.synchronize()
          self.presentShareSheet(
            symbolName: "checkmark.circle.fill",
            copy: self.copyImportStarted(),
            onPrimary: { [weak self] in self?.completeExtension() }
          )
        case .notSignedIn:
          self.presentShareSheet(
            symbolName: "person.crop.circle.badge.exclamationmark",
            copy: self.copySignInRequired(),
            onPrimary: { [weak self] in self?.openHostApp() },
            onSecondary: { [weak self] in self?.completeExtension() }
          )
        case .failed(let reason):
          self.presentShareSheet(
            symbolName: "exclamationmark.triangle.fill",
            copy: self.copyImportFailed(reason: reason),
            onPrimary: { [weak self] in self?.openHostApp() },
            onSecondary: { [weak self] in self?.completeExtension() }
          )
        }
      }
    }
  }

  private func presentNoVideoLink() async {
    await MainActor.run {
      presentShareSheet(
        symbolName: "link.badge.plus",
        copy: copyNoVideoLink(),
        onPrimary: { [weak self] in self?.openHostApp() },
        onSecondary: { [weak self] in self?.completeExtension() }
      )
    }
  }

  private func dismissWithError(_ message: String) async {
    await MainActor.run {
      presentShareSheet(
        symbolName: "exclamationmark.circle.fill",
        copy: copyGenericError(message),
        onPrimary: { [weak self] in self?.completeExtension() }
      )
    }
  }

  private func presentShareSheet(
    symbolName: String,
    copy: ShareSheetCopy,
    onPrimary: @escaping () -> Void,
    onSecondary: (() -> Void)? = nil
  ) {
    view.subviews.filter { $0.tag == sheetTag }.forEach { $0.removeFromSuperview() }
    view.backgroundColor = .clear

    let hasSecondary = copy.secondary != nil
    let sheetHeight: CGFloat = hasSecondary ? 360 : 300
    preferredContentSize = CGSize(width: 0, height: sheetHeight)

    let card = UIView()
    card.tag = sheetTag
    card.backgroundColor = .white
    card.layer.cornerRadius = 20
    card.layer.maskedCorners = [
      .layerMinXMinYCorner, .layerMaxXMinYCorner,
      .layerMinXMaxYCorner, .layerMaxXMaxYCorner,
    ]
    card.translatesAutoresizingMaskIntoConstraints = false
    card.alpha = 0
    if prefersRtlInterface {
      card.semanticContentAttribute = .forceRightToLeft
    }
    view.addSubview(card)

    let symbol = UIImageView(image: UIImage(systemName: symbolName))
    symbol.tintColor = accentColor
    symbol.contentMode = .scaleAspectFit
    symbol.translatesAutoresizingMaskIntoConstraints = false

    let titleLabel = UILabel()
    titleLabel.text = copy.title
    titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
    titleLabel.textColor = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
    titleLabel.textAlignment = prefersRtlInterface ? .right : .center
    titleLabel.numberOfLines = 0

    let messageLabel = UILabel()
    messageLabel.text = copy.message
    messageLabel.font = .systemFont(ofSize: 16, weight: .regular)
    messageLabel.textColor = UIColor(red: 100 / 255, green: 116 / 255, blue: 139 / 255, alpha: 1)
    messageLabel.textAlignment = prefersRtlInterface ? .right : .natural
    messageLabel.numberOfLines = 0

    let primaryButton = makeSheetButton(title: copy.primary, filled: true, action: onPrimary)
    let stack = UIStackView(arrangedSubviews: [symbol, titleLabel, messageLabel, primaryButton])
    stack.axis = .vertical
    stack.spacing = 12
    stack.alignment = .fill
    stack.translatesAutoresizingMaskIntoConstraints = false
    if prefersRtlInterface {
      stack.semanticContentAttribute = .forceRightToLeft
    }
    card.addSubview(stack)

    if let secondaryTitle = copy.secondary, let onSecondary {
      let secondaryButton = makeSheetButton(title: secondaryTitle, filled: false, action: onSecondary)
      stack.addArrangedSubview(secondaryButton)
    }

    NSLayoutConstraint.activate([
      card.topAnchor.constraint(equalTo: view.topAnchor),
      card.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      card.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      card.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      symbol.heightAnchor.constraint(equalToConstant: 44),
      stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
      stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
      stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24),
    ])

    UIView.animate(withDuration: 0.22, delay: 0, options: .curveEaseOut) {
      card.alpha = 1
    }
  }

  private func makeSheetButton(title: String, filled: Bool, action: @escaping () -> Void) -> UIButton {
    var config = UIButton.Configuration.filled()
    config.title = title
    config.cornerStyle = .large
    config.baseForegroundColor = filled ? .white : accentColor
    config.baseBackgroundColor = filled ? accentColor : UIColor(red: 239 / 255, green: 246 / 255, blue: 255 / 255, alpha: 1)
    config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16)
    let button = UIButton(configuration: config)
    let handler: UIActionHandler = { _ in action() }
    button.addAction(UIAction(handler: handler), for: .touchUpInside)
    return button
  }

  private func completeExtension() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  /// Write share payload to the key expo-share-intent reads before opening the host app.
  private func prepareHostAppLaunch() -> HostRedirectType {
    let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
    if let videoUrl = pendingVideoUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !videoUrl.isEmpty {
      let payload = [ShareWebUrlPayload(url: videoUrl, meta: "")]
      if let data = try? JSONEncoder().encode(payload) {
        ud?.set(data, forKey: sharedKey)
        ud?.synchronize()
        return .weburl
      }
    }
    if let texts = ud?.array(forKey: directImportTextKey) as? [String], !texts.isEmpty {
      ud?.set(texts, forKey: sharedKey)
      ud?.synchronize()
      return .text
    }
    return .text
  }

  private func openHostApp() {
    let redirectType = prepareHostAppLaunch()
    guard let url = URL(string: "\(shareProtocol)://dataUrl=\(sharedKey)#\(redirectType.rawValue)") else {
      completeExtension()
      return
    }
    redirectToHostApp(url: url)
  }

  /// Same handoff pattern as expo-share-intent (UIApplication on responder chain + extensionContext fallback).
  private func redirectToHostApp(url: URL) {
    var opened = false
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        opened = true
        break
      }
      responder = current.next
    }

    if !opened, let context = extensionContext {
      context.open(url) { success in
        opened = success
      }
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
      self?.completeExtension()
    }
  }

  private func extractVideoUrl(from text: String) -> String? {
    if let u = extractVideoUrlHttps(in: text) { return u }
    return extractVideoUrlSchemeless(in: text)
  }

  private func extractVideoUrlHttps(in text: String) -> String? {
    let pattern = "https?:\\/\\/[^\\s<>\"']+"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return nil }
    let full = NSRange(location: 0, length: (text as NSString).length)
    let hosts = ["tiktok.com", "instagram.com", "instagr.am", "facebook.com", "fb.watch"]
    for m in regex.matches(in: text, options: [], range: full) {
      guard let r = Range(m.range, in: text) else { continue }
      var url = String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
      url = trimTrailingPunctuation(from: url)
      if hosts.contains(where: { url.lowercased().contains($0) }) { return url }
    }
    return nil
  }

  private func extractVideoUrlSchemeless(in text: String) -> String? {
    let pattern =
      "\\b(?:(?:www\\.|vm\\.)?tiktok\\.com|(?:www\\.)?(?:instagram\\.com|instagr\\.am)|(?:m\\.)?facebook\\.com|fb\\.watch)/[^\\s<>\"']+"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return nil }
    let full = NSRange(location: 0, length: (text as NSString).length)
    guard let m = regex.firstMatch(in: text, options: [], range: full),
          let r = Range(m.range, in: text) else { return nil }
    var path = String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
    path = trimTrailingPunctuation(from: path)
    return "https://\(path)"
  }

  private func trimTrailingPunctuation(from url: String) -> String {
    var u = url
    while let last = u.last, !last.isLetter, !last.isNumber, last != "/" {
      u.removeLast()
    }
    return u
  }

  private func attemptDirectVideoImport(
    urlString: String,
    completion: @escaping (DirectImportOutcome) -> Void
  ) {
    let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
    guard let token = ud?.string(forKey: shareExtensionAuthKey), !token.isEmpty else {
      completion(.notSignedIn)
      return
    }
    if supabaseAnonKey.isEmpty {
      completion(.failed("Missing Supabase API key in this build."))
      return
    }
    guard let endpoint = URL(string: supabaseImportEndpoint), supabaseImportEndpoint.hasPrefix("http") else {
      completion(.failed("Missing import URL in this build."))
      return
    }
    var req = URLRequest(url: endpoint)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["url": urlString])
    URLSession.shared.dataTask(with: req) { data, response, err in
      if let err = err {
        completion(.failed("Network error: \(err.localizedDescription)"))
        return
      }
      guard let http = response as? HTTPURLResponse else {
        completion(.failed("Invalid server response."))
        return
      }
      if http.statusCode == 401 {
        completion(.notSignedIn)
        return
      }
      if !(200...299).contains(http.statusCode) {
        let preview = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        completion(.failed("Server returned HTTP \(http.statusCode). \(preview.prefix(80))"))
        return
      }
      completion(.success)
    }.resume()
  }
}
