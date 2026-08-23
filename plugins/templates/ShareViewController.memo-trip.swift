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

  private enum DirectImportOutcome {
    case success
    case notSignedIn
    case failed(String)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.isHidden = true
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
          self.presentShareAlert(
            title: "Memo Trip",
            message: "The reel is being imported.",
            actions: [
              UIAlertAction(title: "OK", style: .default) { [weak self] _ in
                self?.completeExtension()
              },
            ]
          )
        case .notSignedIn:
          self.presentShareAlert(
            title: "Sign in required",
            message: "Open Memo Trip once and sign in. After that, shared reels import from here.",
            actions: [
              UIAlertAction(title: "Open Memo Trip", style: .default) { [weak self] _ in
                self?.openHostApp()
              },
              UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
                self?.completeExtension()
              },
            ]
          )
        case .failed(let reason):
          self.presentShareAlert(
            title: "Import failed",
            message: reason,
            actions: [
              UIAlertAction(title: "Open Memo Trip", style: .default) { [weak self] _ in
                self?.openHostApp()
              },
              UIAlertAction(title: "OK", style: .cancel) { [weak self] _ in
                self?.completeExtension()
              },
            ]
          )
        }
      }
    }
  }

  private func presentNoVideoLink() async {
    await MainActor.run {
      presentShareAlert(
        title: "No video link found",
        message: "Memo Trip could not read a reel link from this share.",
        actions: [
          UIAlertAction(title: "Open Memo Trip", style: .default) { [weak self] in
            self?.openHostApp()
          },
          UIAlertAction(title: "Cancel", style: .cancel) { [weak self] in
            self?.completeExtension()
          },
        ]
      )
    }
  }

  private func dismissWithError(_ message: String) async {
    await MainActor.run {
      presentShareAlert(
        title: "Error",
        message: message,
        actions: [
          UIAlertAction(title: "OK", style: .cancel) { [weak self] _ in
            self?.completeExtension()
          },
        ]
      )
    }
  }

  private func presentShareAlert(title: String, message: String, actions: [UIAlertAction]) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    for action in actions { alert.addAction(action) }
    present(alert, animated: true)
  }

  private func completeExtension() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  private func openHostApp() {
    guard let url = URL(string: "\(shareProtocol)://dataUrl=\(sharedKey)#weburl") else {
      completeExtension()
      return
    }
    extensionContext?.open(url, completionHandler: { [weak self] _ in
      self?.completeExtension()
    })
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
