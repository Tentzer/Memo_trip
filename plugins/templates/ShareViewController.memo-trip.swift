/*!
 * Native module created for Expo Share Intent (https://github.com/achorein/expo-share-intent)
 * author: achorein (https://github.com/achorein)
 * inspired by :
 *  - https://ajith-ab.github.io/react-native-receive-sharing-intent/docs/ios#create-share-extension
 */
import MobileCoreServices
import Photos
import Social
import UIKit
import AVFoundation

class ShareViewController: UIViewController {
  let hostAppGroupIdentifier = "<GROUPIDENTIFIER>"
  let shareProtocol = "<SCHEME>"
  let sharedKey = "<SCHEME>ShareKey"
  let supabaseImportEndpoint = "<SUPABASE_IMPORT_URL>"
  let supabaseAnonKey = "<SUPABASE_ANON_KEY>"
  let shareExtensionAuthKey = "memoTripSupabaseAccessToken"
  let directImportTextKey = "memoTripShareText"
  let directImportWebUrlKey = "memoTripShareWebUrl"
  var debugPreScanSummary: String = ""
  private var isExtensionUIReady = false

  private enum DirectImportOutcome {
    case success
    case notSignedIn
    case failed(String)
  }

  var sharedMedia: [SharedMediaFile] = []
  var sharedWebUrl: [WebUrl] = []
  var sharedText: [String] = []
  let imageContentType: String = UTType.image.identifier
  let videoContentType: String = UTType.movie.identifier
  let textContentType: String = UTType.text.identifier
  let urlContentType: String = UTType.url.identifier
  let propertyListType: String = UTType.propertyList.identifier
  let fileURLType: String = UTType.fileURL.identifier
  let pkpassContentType: String = "com.apple.pkpass"
  let pdfContentType: String = UTType.pdf.identifier
  let vcardContentType: String = "public.vcard"

  override func viewDidLoad() {
    super.viewDidLoad()
    let endpointPreview = supabaseImportEndpoint.isEmpty
      ? "<empty>" : String(supabaseImportEndpoint.prefix(60))
    let anonPreview = supabaseAnonKey.isEmpty ? "<empty>" : String(supabaseAnonKey.prefix(8)) + "..."
    NSLog(
      "[ShareExtension] config group=\(hostAppGroupIdentifier) scheme=\(shareProtocol) endpoint=\(endpointPreview) anon=\(anonPreview)"
    )
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    isExtensionUIReady = true
    Task {
      guard let extensionContext = self.extensionContext,
        let content = extensionContext.inputItems.first as? NSExtensionItem,
        let attachments = content.attachments
      else {
        dismissWithError(message: "No content found")
        return
      }

      // Pre-scan for video URLs BEFORE the attachment dispatch loop.
      // Each handler spawns Task.detached and returns immediately, so all
      // handlers race. If Instagram sends only a preview image attachment, the
      // image handler calls redirectToHostApp before any URL is extracted.
      //
      // Critically: Instagram puts the reel URL in NSExtensionItem.attributedContentText
      // (the share caption), NOT as a separate URL attachment. We must check that
      // field first, then fall back to scanning attachments.
      var preScanUrls: [WebUrl] = []
      var preScanText: [String] = []

      // 1. Check NSExtensionItem text fields — this is where Instagram puts the URL
      if let attrText = content.attributedContentText?.string, !attrText.isEmpty {
        NSLog("[ShareExtension] pre-scan attributedContentText=\(attrText.prefix(200))")
        preScanText.append(attrText)
      }
      if let attrTitle = content.attributedTitle?.string, !attrTitle.isEmpty {
        NSLog("[ShareExtension] pre-scan attributedTitle=\(attrTitle.prefix(200))")
        preScanText.append(attrTitle)
      }

      // 2. Scan each attachment for URL and text types
      for attachment in attachments {
        NSLog("[ShareExtension] attachment types=\(attachment.registeredTypeIdentifiers)")
        if attachment.hasItemConformingToTypeIdentifier(urlContentType) {
          if let urlItem = try? await attachment.loadItem(forTypeIdentifier: urlContentType) as? URL {
            let candidate = urlItem.absoluteString
            if !preScanUrls.contains(where: { $0.url == candidate }) {
              preScanUrls.append(WebUrl(url: candidate, meta: ""))
              NSLog("[ShareExtension] pre-scan url=\(candidate)")
            }
          } else if let urlStr = try? await attachment.loadItem(forTypeIdentifier: urlContentType) as? String {
            if !preScanText.contains(urlStr) {
              preScanText.append(urlStr)
              NSLog("[ShareExtension] pre-scan url-as-string=\(urlStr.prefix(200))")
            }
          }
        }
        if attachment.hasItemConformingToTypeIdentifier(textContentType) {
          if let text = try? await attachment.loadItem(forTypeIdentifier: textContentType) as? String {
            if !preScanText.contains(text) {
              preScanText.append(text)
              NSLog("[ShareExtension] pre-scan text=\(text.prefix(200))")
            }
          }
        }
      }

      let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
      if !preScanUrls.isEmpty {
        if sharedWebUrl.isEmpty { sharedWebUrl = preScanUrls }
        ud?.set(toData(data: preScanUrls), forKey: directImportWebUrlKey)
        ud?.synchronize()
      }
      if !preScanText.isEmpty {
        if sharedText.isEmpty { sharedText = preScanText }
        ud?.set(preScanText, forKey: directImportTextKey)
        ud?.synchronize()
      }
      let textPreview = preScanText.map { String($0.prefix(120)) }.joined(separator: " | ")
      let urlPreview = preScanUrls.map { $0.url }.joined(separator: " | ")
      debugPreScanSummary = "urls[\(preScanUrls.count)]: \(urlPreview)\ntexts[\(preScanText.count)]: \(textPreview)"
      NSLog("[ShareExtension] pre-scan done: \(preScanUrls.count) urls, \(preScanText.count) text items")
      NSLog("[ShareExtension] pre-scan summary: \(debugPreScanSummary)")

      for (index, attachment) in (attachments).enumerated() {
        if attachment.hasItemConformingToTypeIdentifier(imageContentType) {
          await handleImages(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(videoContentType) {
          await handleVideos(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(vcardContentType) {
          await handleVCard(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(fileURLType) {
          await handleFiles(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(pkpassContentType) {
          await handlePkPass(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(pdfContentType) {
          await handlePdf(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(urlContentType) {
          await handleUrl(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(textContentType) {
          await handleText(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(propertyListType) {
          await handlePrepocessing(content: content, attachment: attachment, index: index)
        } else {
          NSLog("[ERROR] content type not handle !\(String(describing: content))")
          dismissWithError(message: "content type not handle \(String(describing: content)))")
        }
      }
    }
  }

  private func handleVCard(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      do {
        if let url = try? await attachment.loadItem(forTypeIdentifier: self.vcardContentType) as? URL {
          // ensure a .vcf file extension so mime resolves properly
          let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".vcf")
          _ = self.copyFile(at: url, to: tmp)
          Task { @MainActor in
            await self.handleFileURL(content: content, url: tmp, index: index)
          }
        } else if let data = try? await attachment.loadItem(forTypeIdentifier: self.vcardContentType) as? Data {
          let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".vcf")
          try data.write(to: tmp)
          Task { @MainActor in
            await self.handleFileURL(content: content, url: tmp, index: index)
          }
        } else {
          NSLog("[ERROR] Cannot load vcard content !\(String(describing: content))")
          await self.dismissWithError(message: "Cannot load vCard content \(String(describing: content))")
        }
      } catch {
        NSLog("[ERROR] handleVCard exception: \(error.localizedDescription)")
        await self.dismissWithError(message: "vCard error: \(error.localizedDescription)")
      }
    }
  }

  private func handleText(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let item = try! await attachment.loadItem(forTypeIdentifier: self.textContentType)
        as? String
      {
        Task { @MainActor in

          self.sharedText.append(item)
          let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
          userDefaults?.set(self.sharedText, forKey: self.directImportTextKey)
          userDefaults?.synchronize()
          if index == (content.attachments?.count)! - 1 {
            userDefaults?.set(self.sharedText, forKey: self.sharedKey)
            userDefaults?.synchronize()
            self.redirectToHostApp(type: .text)
          }

        }
      } else {
        NSLog("[ERROR] Cannot load text content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load text content \(String(describing: content))")
      }
    }
  }

  private func handleUrl(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let item = try! await attachment.loadItem(forTypeIdentifier: self.urlContentType) as? URL {
        Task { @MainActor in

          self.sharedWebUrl.append(WebUrl(url: item.absoluteString, meta: ""))
          let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
          userDefaults?.set(self.toData(data: self.sharedWebUrl), forKey: self.directImportWebUrlKey)
          userDefaults?.synchronize()
          if index == (content.attachments?.count)! - 1 {
            userDefaults?.set(self.toData(data: self.sharedWebUrl), forKey: self.sharedKey)
            userDefaults?.synchronize()
            self.redirectToHostApp(type: .weburl)
          }

        }
      } else {
        NSLog("[ERROR] Cannot load url content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load url content \(String(describing: content))")
      }
    }
  }

  private func handlePrepocessing(content: NSExtensionItem, attachment: NSItemProvider, index: Int)
    async
  {
    Task.detached {
      if let item = try! await attachment.loadItem(
        forTypeIdentifier: self.propertyListType, options: nil)
        as? NSDictionary
      {
        Task { @MainActor in

          if let results = item[NSExtensionJavaScriptPreprocessingResultsKey]
            as? NSDictionary
          {
            NSLog(
              "[DEBUG] NSExtensionJavaScriptPreprocessingResultsKey \(String(describing: results))"
            )
            self.sharedWebUrl.append(
              WebUrl(url: results["baseURI"] as! String, meta: results["meta"] as! String))
            let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
            userDefaults?.set(self.toData(data: self.sharedWebUrl), forKey: self.directImportWebUrlKey)
            userDefaults?.synchronize()
            if index == (content.attachments?.count)! - 1 {
              userDefaults?.set(self.toData(data: self.sharedWebUrl), forKey: self.sharedKey)
              userDefaults?.synchronize()
              self.redirectToHostApp(type: .weburl)
            }
          } else {
            NSLog("[ERROR] Cannot load preprocessing results !\(String(describing: content))")
            self.dismissWithError(
              message: "Cannot load preprocessing results \(String(describing: content))")
          }

        }
      } else {
        NSLog("[ERROR] Cannot load preprocessing content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load preprocessing content \(String(describing: content))")
      }
    }
  }

  private func handlePkPass(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
      Task.detached {
          NSLog("[DEBUG] Attempting to handle pkpass file for item \(index)")
          NSLog("[DEBUG] Available type identifiers: \(attachment.registeredTypeIdentifiers)")
  
          do {
              if let url = try await attachment.loadItem(forTypeIdentifier: self.pkpassContentType) as? URL {
                  NSLog("[DEBUG] Successfully loaded pkpass as URL: \(url.absoluteString)")
                  NSLog("[DEBUG] URL path: \(url.path), isFileURL: \(url.isFileURL)")
                  await self.handleFileURL(content: content, url: url, index: index)
  
              } else if let data = try await attachment.loadItem(forTypeIdentifier: self.pkpassContentType) as? Data {
                  NSLog("[DEBUG] Successfully loaded pkpass as Data, size: \(data.count) bytes")
                  let tempFileName = UUID().uuidString + ".pkpass"
                  let tempFileURL = FileManager.default.temporaryDirectory.appendingPathComponent(tempFileName)
  
                  // Writing data to a file is I/O, keep it off the main thread.
                  try data.write(to: tempFileURL)
                  NSLog("[DEBUG] Saved pkpass data to temporary file: \(tempFileURL.path)")
  
                  // Handle the newly created temporary file URL.
                  await self.handleFileURL(content: content, url: tempFileURL, index: index)
  
              } else {
                  // If it's neither URL nor Data, it's unexpected for pkpassContentType.
                  NSLog("[ERROR] Cannot load pkpass content: Item was neither URL nor Data for type \(self.pkpassContentType). Attachment: \(attachment)")
                  // Ensure dismissWithError runs on the main thread if it interacts with UI
                  Task { @MainActor in
                      self.dismissWithError(message: "Cannot load pkpass content (unexpected data type).")
                  }
              }
          } catch {
              // Catch errors from loadItem or data.write
              NSLog("[ERROR] Exception when handling pkpass: \(error.localizedDescription)")
              // Ensure dismissWithError runs on the main thread if it interacts with UI
              Task { @MainActor in
                  self.dismissWithError(message: "Error processing pkpass: \(error.localizedDescription)")
              }
          }
      }
  }


  private func handleImages(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      do {
        let item = try await attachment.loadItem(forTypeIdentifier: self.imageContentType)
        
        Task { @MainActor in
          var url: URL? = nil
          
          if let dataURL = item as? URL {
            url = dataURL
          } else if let imageData = item as? UIImage {
            url = self.saveScreenshot(imageData)
            if url == nil {
              NSLog("[ERROR] handleImages: saveScreenshot returned nil")
            }
          } else if let data = item as? Data {
            if let image = UIImage(data: data) {
              url = self.saveScreenshot(image)
            } else {
              NSLog("[ERROR] handleImages: Failed to create UIImage from Data")
            }
          } else {
            NSLog("[ERROR] handleImages: Item is unexpected type: \(type(of: item))")
          }

          guard let safeURL = url else {
            NSLog("[ERROR] handleImages: Failed to get URL for image item")
            self.dismissWithError(message: "Failed to process image")
            return
          }

          var pixelWidth: Int? = nil
          var pixelHeight: Int? = nil
          if let imageSource = CGImageSourceCreateWithURL(safeURL as CFURL, nil) {
            if let imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil)
              as Dictionary?
            {
              pixelWidth = imageProperties[kCGImagePropertyPixelWidth] as? Int
              pixelHeight = imageProperties[kCGImagePropertyPixelHeight] as? Int
              // Check orientation and flip size if required
              if let orientationNumber = imageProperties[kCGImagePropertyOrientation] as! CFNumber?
              {
                var orientation: Int = 0
                CFNumberGetValue(orientationNumber, .intType, &orientation)
                if orientation > 4 {
                  let temp: Int? = pixelWidth
                  pixelWidth = pixelHeight
                  pixelHeight = temp
                }
              }
            }
          }

          // Always copy
          let fileName = self.getFileName(from: safeURL, type: .image)
          let fileExtension = self.getExtension(from: safeURL, type: .image)
          let fileSize = self.getFileSize(from: safeURL)
          let mimeType = safeURL.mimeType(ext: fileExtension)
          let newName = "\(UUID().uuidString).\(fileExtension)"
          let newPath = FileManager.default
            .containerURL(
              forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
            .appendingPathComponent(newName)
          
          let copied = self.copyFile(at: safeURL, to: newPath)
          
          if copied {
            self.sharedMedia.append(
              SharedMediaFile(
                path: newPath.absoluteString, thumbnail: nil, fileName: fileName,
                fileSize: fileSize, width: pixelWidth, height: pixelHeight, duration: nil,
                mimeType: mimeType, type: .image))
          }

          // If this is the last item, save imagesData in userDefaults and redirect to host app
          if index == (content.attachments?.count)! - 1 {
            let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
            userDefaults?.set(self.toData(data: self.sharedMedia), forKey: self.sharedKey)
            userDefaults?.synchronize()
            self.redirectToHostApp(type: .media)
          }
        }
      } catch {
        NSLog("[ERROR] handleImages: Exception loading image item: \(error)")
        await self.dismissWithError(message: "Cannot load image content: \(error.localizedDescription)")
      }
    }
  }

  private func documentDirectoryPath() -> URL? {
    let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    
    if let firstPath = paths.first {
      _ = FileManager.default.fileExists(atPath: firstPath.path)
      return firstPath
    } else {
      return nil
    }
  }

  private func saveScreenshot(_ image: UIImage) -> URL? {
    guard let screenshotData = image.pngData() else {
      return nil
    }
    
    // Try using the app group container instead of documents directory
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier) else {
      return nil
    }
    
    let fileName = "screenshot_\(UUID().uuidString).png"
    let screenshotPath = containerURL.appendingPathComponent(fileName)
    
    do {
      try screenshotData.write(to: screenshotPath)

      let fileExists = FileManager.default.fileExists(atPath: screenshotPath.path)
      
      if fileExists {
        let attributes = try? FileManager.default.attributesOfItem(atPath: screenshotPath.path)
        _ = attributes?[.size] as? Int ?? 0
      }
      
      return screenshotPath
    } catch {
      NSLog("[ERROR] saveScreenshot: Failed to write screenshot: \(error)")
      NSLog("[ERROR] saveScreenshot: Error details: \(error.localizedDescription)")
      return nil
    }
  }

  private func handleVideos(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async
  {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.videoContentType) as? URL
      {
        Task { @MainActor in

          // Always copy
          let fileName = self.getFileName(from: url, type: .video)
          let fileExtension = self.getExtension(from: url, type: .video)
          let fileSize = self.getFileSize(from: url)
          let mimeType = url.mimeType(ext: fileExtension)
          let newName = "\(UUID().uuidString).\(fileExtension)"
          let newPath = FileManager.default
            .containerURL(
              forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
            .appendingPathComponent(newName)
          let copied = self.copyFile(at: url, to: newPath)
          if copied {
            guard
              let sharedFile = self.getSharedMediaFile(
                forVideo: newPath, fileName: fileName, fileSize: fileSize, mimeType: mimeType)
            else {
              return
            }
            self.sharedMedia.append(sharedFile)
          }

          // If this is the last item, save imagesData in userDefaults and redirect to host app
          if index == (content.attachments?.count)! - 1 {
            let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
            userDefaults?.set(self.toData(data: self.sharedMedia), forKey: self.sharedKey)
            userDefaults?.synchronize()
            self.redirectToHostApp(type: .media)
          }

        }
      } else {
        NSLog("[ERROR] Cannot load video content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load video content \(String(describing: content))")
      }
    }
  }

  private func handlePdf(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.pdfContentType) as? URL {
        Task { @MainActor in

          await self.handleFileURL(content: content, url: url, index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load pdf content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load pdf content \(String(describing: content))")
      }
    }
  }

  private func handleFiles(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.fileURLType) as? URL {
        Task { @MainActor in

          await self.handleFileURL(content: content, url: url, index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load file content !\(String(describing: content))")
        await self.dismissWithError(
          message: "Cannot load file content \(String(describing: content))")
      }
    }
  }

  private func handleFileURL(content: NSExtensionItem, url: URL, index: Int) async {
    // Always copy
    let fileName = self.getFileName(from: url, type: .file)
    let fileExtension = self.getExtension(from: url, type: .file)
    let fileSize = self.getFileSize(from: url)
    let mimeType = url.mimeType(ext: fileExtension)
    let newName = "\(UUID().uuidString).\(fileExtension)"
    let newPath = FileManager.default
      .containerURL(
        forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
      .appendingPathComponent(newName)
    let copied = self.copyFile(at: url, to: newPath)
    if copied {
      self.sharedMedia.append(
        SharedMediaFile(
          path: newPath.absoluteString, thumbnail: nil, fileName: fileName,
          fileSize: fileSize, width: nil, height: nil, duration: nil, mimeType: mimeType,
          type: .file))
    }

    if index == (content.attachments?.count)! - 1 {
      let userDefaults = UserDefaults(suiteName: self.hostAppGroupIdentifier)
      userDefaults?.set(self.toData(data: self.sharedMedia), forKey: self.sharedKey)
      userDefaults?.synchronize()
      self.redirectToHostApp(type: .file)
    }
  }

  private func dismissWithError(message: String? = nil) {
    let text = message ?? "Unknown error"
    presentShareAlert(
      title: "Error",
      message: text,
      actions: [
        UIAlertAction(title: "OK", style: .cancel) { [weak self] _ in
          self?.completeExtension()
        },
      ]
    )
  }

  /// Present UI only after the extension view is in the hierarchy (alerts were invisible before).
  private func whenViewReady(_ action: @escaping () -> Void) {
    let attempt: () -> Void = {
      if self.isExtensionUIReady && self.view.window != nil {
        action()
      } else {
        DispatchQueue.main.async(execute: attempt)
      }
    }
    DispatchQueue.main.async(execute: attempt)
  }

  private func presentShareAlert(
    title: String,
    message: String,
    actions: [UIAlertAction]
  ) {
    whenViewReady {
      let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
      for action in actions {
        alert.addAction(action)
      }
      self.present(alert, animated: true, completion: nil)
    }
  }

  private func completeExtension() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  private func redirectToHostApp(type: RedirectType) {
    whenViewReady { [weak self] in
      guard let self = self else { return }
      let videoUrl = self.readAnyVideoImportUrlFromDefaults()
      NSLog("[ShareExtension] redirectToHostApp type=\(type) videoUrl=\(videoUrl ?? "<none>")")

      if let videoUrl = videoUrl {
        self.attemptDirectVideoImport(urlString: videoUrl) { outcome in
          DispatchQueue.main.async {
            switch outcome {
            case .success:
              self.presentShareAlert(
                title: "Memo Trip",
                message:
                  "This reel is being imported. Open Memo Trip when you are ready to add places to your map.",
                actions: [
                  UIAlertAction(title: "OK", style: .default) { [weak self] _ in
                    self?.completeExtension()
                  },
                ]
              )
            case .notSignedIn:
              self.presentShareAlert(
                title: "Sign in required",
                message:
                  "Open Memo Trip and sign in once. After that, shared reels can import without leaving Instagram.",
                actions: [
                  UIAlertAction(title: "Open Memo Trip", style: .default) { [weak self] _ in
                    self?.openHostAppForShare(type: type)
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
                    self?.openHostAppForShare(type: type)
                  },
                  UIAlertAction(title: "OK", style: .cancel) { [weak self] _ in
                    self?.completeExtension()
                  },
                ]
              )
            }
          }
        }
        return
      }

      NSLog("[ShareExtension] no video URL found in share payload (type=\(type))")
      let detail = self.debugPreScanSummary.isEmpty
        ? "Memo Trip could not read a reel link from this share."
        : self.debugPreScanSummary
      self.presentShareAlert(
        title: "No video link found",
        message: detail,
        actions: [
          UIAlertAction(title: "Open Memo Trip", style: .default) { [weak self] _ in
            self?.openHostAppForShare(type: type)
          },
          UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            self?.completeExtension()
          },
        ]
      )
    }
  }

  private func readAnyVideoImportUrlFromDefaults() -> String? {
    let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
    if let arr = ud?.object(forKey: directImportTextKey) as? [String],
       let found = extractVideoUrl(from: arr.joined(separator: "\n")) {
      return found
    }
    if let data = ud?.object(forKey: directImportWebUrlKey) as? Data,
       let urls = try? JSONDecoder().decode([WebUrl].self, from: data) {
      for w in urls {
        if let found = extractVideoUrl(from: w.url) { return found }
        if let found = extractVideoUrl(from: w.meta) { return found }
      }
    }
    if let arr = ud?.object(forKey: sharedKey) as? [String],
       let found = extractVideoUrl(from: arr.joined(separator: "\n")) {
      return found
    }
    if let data = ud?.object(forKey: sharedKey) as? Data,
       let urls = try? JSONDecoder().decode([WebUrl].self, from: data) {
      for w in urls {
        if let found = extractVideoUrl(from: w.url) { return found }
        if let found = extractVideoUrl(from: w.meta) { return found }
      }
    }
    return nil
  }

  private func openHostAppForShare(type: RedirectType) {
    let typeFragment: String
    switch type {
    case .media: typeFragment = "media"
    case .text: typeFragment = "text"
    case .weburl: typeFragment = "weburl"
    case .file: typeFragment = "file"
    }
    guard let url = URL(string: "\(shareProtocol)://dataUrl=\(sharedKey)#\(typeFragment)") else {
      dismissWithError(message: "Invalid app URL scheme")
      return
    }
    NSLog("[ShareExtension] opening host app \(url.absoluteString)")
    extensionContext?.open(url, completionHandler: { [weak self] accepted in
      guard let self = self else { return }
      if !accepted {
        NSLog("[ShareExtension] extensionContext.open returned false")
      }
      self.completeExtension()
    })
  }

  private func readVideoImportUrlFromDefaults(type: RedirectType) -> String? {
    let ud = UserDefaults(suiteName: hostAppGroupIdentifier)
    switch type {
    case .text:
      guard let arr = ud?.object(forKey: sharedKey) as? [String] else { return nil }
      return extractVideoUrl(from: arr.joined(separator: "\n"))
    case .weburl:
      guard let data = ud?.object(forKey: sharedKey) as? Data,
            let urls = try? JSONDecoder().decode([WebUrl].self, from: data) else { return nil }
      for w in urls {
        if let found = extractVideoUrl(from: w.url) { return found }
        if let found = extractVideoUrl(from: w.meta) { return found }
      }
      return nil
    default:
      return nil
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
    let matches = regex.matches(in: text, options: [], range: full)
    let hosts = [
      "tiktok.com", "instagram.com", "instagr.am", "l.instagram.com", "facebook.com", "fb.watch",
    ]
    for m in matches {
      guard let r = Range(m.range, in: text) else { continue }
      var url = String(text[r]).trimmingCharacters(in: .whitespacesAndNewlines)
      url = trimTrailingPunctuation(from: url)
      let lower = url.lowercased()
      if hosts.contains(where: { lower.contains($0) }) {
        return url
      }
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
      NSLog("[ShareExtension] no auth token in app group \(hostAppGroupIdentifier)")
      completion(.notSignedIn)
      return
    }
    if supabaseAnonKey.isEmpty {
      completion(.failed("Missing Supabase API key in this build. Rebuild with EXPO_PUBLIC_SUPABASE_ANON_KEY set."))
      return
    }
    guard let endpoint = URL(string: supabaseImportEndpoint), supabaseImportEndpoint.hasPrefix("http") else {
      completion(.failed("Missing import URL in this build. Rebuild with EXPO_PUBLIC_SUPABASE_URL set."))
      return
    }
    var req = URLRequest(url: endpoint)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
    let body = ["url": urlString]
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    NSLog("[ShareExtension] POST \(supabaseImportEndpoint) url=\(urlString.prefix(80))")
    let task = URLSession.shared.dataTask(with: req) { data, response, err in
      if let err = err {
        NSLog("[ShareExtension] import request error: \(err.localizedDescription)")
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
        NSLog("[ShareExtension] import HTTP \(http.statusCode): \(preview.prefix(200))")
        completion(.failed("Server returned HTTP \(http.statusCode). Open Memo Trip to import from the app."))
        return
      }
      NSLog("[ShareExtension] import queued OK")
      completion(.success)
    }
    task.resume()
  }

  enum RedirectType {
    case media
    case text
    case weburl
    case file
  }

  func getExtension(from url: URL, type: SharedMediaType) -> String {
    let parts = url.lastPathComponent.components(separatedBy: ".")
    var ex: String? = nil
    if parts.count > 1 {
      ex = parts.last
    }
    if ex == nil {
      switch type {
      case .image:
        ex = "PNG"
      case .video:
        ex = "MP4"
      case .file:
        ex = "TXT"
        if url.lastPathComponent.lowercased().contains("pkpass") { ex = "pkpass" }
      }
    }
    return ex ?? "Unknown"
  }

  func getFileName(from url: URL, type: SharedMediaType) -> String {
    var name = url.lastPathComponent
    if name == "" {
      name = UUID().uuidString + "." + getExtension(from: url, type: type)
    }
    return name
  }

  func getFileSize(from url: URL) -> Int? {
    do {
      let resources = try url.resourceValues(forKeys: [.fileSizeKey])
      return resources.fileSize
    } catch {
      NSLog("Error: \(error)")
      return nil
    }
  }

  func copyFile(at srcURL: URL, to dstURL: URL) -> Bool {
    do {
      if FileManager.default.fileExists(atPath: dstURL.path) {
        try FileManager.default.removeItem(at: dstURL)
      }
      try FileManager.default.copyItem(at: srcURL, to: dstURL)
    } catch (let error) {
      NSLog("Cannot copy item at \(srcURL) to \(dstURL): \(error)")
      return false
    }
    return true
  }

  private func getSharedMediaFile(forVideo: URL, fileName: String, fileSize: Int?, mimeType: String)
    -> SharedMediaFile?
  {
    let asset = AVAsset(url: forVideo)
    let thumbnailPath = getThumbnailPath(for: forVideo)
    let duration = (CMTimeGetSeconds(asset.duration) * 1000).rounded()
    var trackWidth: Int? = nil
    var trackHeight: Int? = nil

    // get video info
    let track = asset.tracks(withMediaType: AVMediaType.video).first ?? nil
    if track != nil {
      let size = track!.naturalSize.applying(track!.preferredTransform)
      trackWidth = abs(Int(size.width))
      trackHeight = abs(Int(size.height))
    }

    if FileManager.default.fileExists(atPath: thumbnailPath.path) {
      return SharedMediaFile(
        path: forVideo.absoluteString, thumbnail: thumbnailPath.absoluteString, fileName: fileName,
        fileSize: fileSize, width: trackWidth, height: trackHeight, duration: duration,
        mimeType: mimeType, type: .video)
    }

    var saved = false
    let assetImgGenerate = AVAssetImageGenerator(asset: asset)
    assetImgGenerate.appliesPreferredTrackTransform = true
    assetImgGenerate.maximumSize = CGSize(width: 360, height: 360)
    do {
      let img = try assetImgGenerate.copyCGImage(
        at: CMTimeMakeWithSeconds(600, preferredTimescale: Int32(1.0)), actualTime: nil)
      try UIImage.pngData(UIImage(cgImage: img))()?.write(to: thumbnailPath)
      saved = true
    } catch {
      saved = false
    }

    return saved
      ? SharedMediaFile(
        path: forVideo.absoluteString, thumbnail: thumbnailPath.absoluteString, fileName: fileName,
        fileSize: fileSize, width: trackWidth, height: trackHeight, duration: duration,
        mimeType: mimeType, type: .video) : nil
  }

  private func getThumbnailPath(for url: URL) -> URL {
    let fileName = Data(url.lastPathComponent.utf8).base64EncodedString().replacingOccurrences(
      of: "==", with: "")
    let path = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
      .appendingPathComponent("\(fileName).jpg")
    return path
  }

  class WebUrl: Codable {
    var url: String
    var meta: String

    init(url: String, meta: String) {
      self.url = url
      self.meta = meta
    }
  }

  class SharedMediaFile: Codable {
    var path: String  // can be image, video or url path
    var thumbnail: String?  // video thumbnail
    var fileName: String  // uuid + extension
    var fileSize: Int?
    var width: Int?  // for image
    var height: Int?  // for image
    var duration: Double?  // video duration in milliseconds
    var mimeType: String
    var type: SharedMediaType

    init(
      path: String, thumbnail: String?, fileName: String, fileSize: Int?, width: Int?, height: Int?,
      duration: Double?, mimeType: String, type: SharedMediaType
    ) {
      self.path = path
      self.thumbnail = thumbnail
      self.fileName = fileName
      self.fileSize = fileSize
      self.width = width
      self.height = height
      self.duration = duration
      self.mimeType = mimeType
      self.type = type
    }
  }

  enum SharedMediaType: Int, Codable {
    case image
    case video
    case file
  }

  func toData(data: [WebUrl]) -> Data? {
    let encodedData = try? JSONEncoder().encode(data)
    return encodedData
  }
  func toData(data: [SharedMediaFile]) -> Data? {
    let encodedData = try? JSONEncoder().encode(data)
    return encodedData
  }
}

internal let mimeTypes = [
  "html": "text/html",
  "htm": "text/html",
  "shtml": "text/html",
  "css": "text/css",
  "xml": "text/xml",
  "gif": "image/gif",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "js": "application/javascript",
  "atom": "application/atom+xml",
  "rss": "application/rss+xml",
  "mml": "text/mathml",
  "txt": "text/plain",
  "jad": "text/vnd.sun.j2me.app-descriptor",
  "wml": "text/vnd.wap.wml",
  "htc": "text/x-component",
  "png": "image/png",
  "tif": "image/tiff",
  "tiff": "image/tiff",
  "wbmp": "image/vnd.wap.wbmp",
  "ico": "image/x-icon",
  "jng": "image/x-jng",
  "bmp": "image/x-ms-bmp",
  "svg": "image/svg+xml",
  "svgz": "image/svg+xml",
  "webp": "image/webp",
  "woff": "application/font-woff",
  "jar": "application/java-archive",
  "war": "application/java-archive",
  "ear": "application/java-archive",
  "json": "application/json",
  "hqx": "application/mac-binhex40",
  "doc": "application/msword",
  "pdf": "application/pdf",
  "ps": "application/postscript",
  "eps": "application/postscript",
  "ai": "application/postscript",
  "rtf": "application/rtf",
  "m3u8": "application/vnd.apple.mpegurl",
  "xls": "application/vnd.ms-excel",
  "eot": "application/vnd.ms-fontobject",
  "ppt": "application/vnd.ms-powerpoint",
  "wmlc": "application/vnd.wap.wmlc",
  "kml": "application/vnd.google-earth.kml+xml",
  "kmz": "application/vnd.google-earth.kmz",
  "7z": "application/x-7z-compressed",
  "cco": "application/x-cocoa",
  "jardiff": "application/x-java-archive-diff",
  "jnlp": "application/x-java-jnlp-file",
  "pkpass": "application/vnd.apple.pkpass",
  "run": "application/x-makeself",
  "pl": "application/x-perl",
  "pm": "application/x-perl",
  "prc": "application/x-pilot",
  "pdb": "application/x-pilot",
  "rar": "application/x-rar-compressed",
  "rpm": "application/x-redhat-package-manager",
  "sea": "application/x-sea",
  "swf": "application/x-shockwave-flash",
  "sit": "application/x-stuffit",
  "tcl": "application/x-tcl",
  "tk": "application/x-tcl",
  "der": "application/x-x509-ca-cert",
  "pem": "application/x-x509-ca-cert",
  "crt": "application/x-x509-ca-cert",
  "xpi": "application/x-xpinstall",
  "xhtml": "application/xhtml+xml",
  "xspf": "application/xspf+xml",
  "zip": "application/zip",
  "epub": "application/epub+zip",
  "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "mid": "audio/midi",
  "midi": "audio/midi",
  "kar": "audio/midi",
  "mp3": "audio/mpeg",
  "ogg": "audio/ogg",
  "m4a": "audio/x-m4a",
  "ra": "audio/x-realaudio",
  "3gpp": "video/3gpp",
  "3gp": "video/3gpp",
  "ts": "video/mp2t",
  "mp4": "video/mp4",
  "mpeg": "video/mpeg",
  "mpg": "video/mpeg",
  "mov": "video/quicktime",
  "webm": "video/webm",
  "flv": "video/x-flv",
  "m4v": "video/x-m4v",
  "mng": "video/x-mng",
  "asx": "video/x-ms-asf",
  "asf": "video/x-ms-asf",
  "wmv": "video/x-ms-wmv",
  "avi": "video/x-msvideo",
  "vcf": "text/vcard",
]

extension URL {
  func mimeType(ext: String?) -> String {
    if #available(iOSApplicationExtension 14.0, *) {
      if let pathExt = ext,
        let mimeType = UTType(filenameExtension: pathExt)?.preferredMIMEType
      {
        return mimeType
      } else {
        return "application/octet-stream"
      }
    } else {
      return mimeTypes[ext?.lowercased() ?? ""] ?? "application/octet-stream"
    }
  }
}

extension Array {
  subscript(safe index: UInt) -> Element? {
    return Int(index) < count ? self[Int(index)] : nil
  }
}
