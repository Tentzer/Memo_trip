import ExpoModulesCore

public class MemoShareExtensionAuthModule: Module {
  private static let appGroupId = "group.com.tentzer.memotrip"
  private static let tokenKey = "memoTripSupabaseAccessToken"
  private static let handoffUrlKey = "memoTripLastDirectImportUrl"
  private static let handoffAtKey = "memoTripDirectImportAt"
  private static let handoffMaxAgeSeconds: TimeInterval = 120

  public func definition() -> ModuleDefinition {
    Name("MemoShareExtensionAuth")

    Function("setAccessToken") { (token: String) in
      UserDefaults(suiteName: Self.appGroupId)?.set(token, forKey: Self.tokenKey)
    }

    Function("hasAccessToken") { () -> Bool in
      guard let token = UserDefaults(suiteName: Self.appGroupId)?.string(forKey: Self.tokenKey) else {
        return false
      }
      return !token.isEmpty
    }

    Function("consumeDirectImportHandoff") { () -> [String: String]? in
      guard let ud = UserDefaults(suiteName: Self.appGroupId) else { return nil }
      let at = ud.double(forKey: Self.handoffAtKey)
      guard at > 0 else { return nil }
      let age = Date().timeIntervalSince1970 - at
      guard age >= 0, age < Self.handoffMaxAgeSeconds else {
        ud.removeObject(forKey: Self.handoffUrlKey)
        ud.removeObject(forKey: Self.handoffAtKey)
        return nil
      }
      let url = ud.string(forKey: Self.handoffUrlKey) ?? ""
      ud.removeObject(forKey: Self.handoffUrlKey)
      ud.removeObject(forKey: Self.handoffAtKey)
      guard !url.isEmpty else { return nil }
      return ["url": url]
    }
  }
}
