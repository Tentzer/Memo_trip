const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function getShareExtensionFolderName(iosShareExtensionName) {
  // expo-share-intent uses the raw iosShareExtensionName as the folder name (spaces and all).
  // We must match it exactly or our file lands in a different folder that Xcode never compiles.
  return iosShareExtensionName || 'ShareExtension';
}

/**
 * After expo-share-intent writes ShareViewController.swift, replace it with the Memo Trip
 * version that POSTs supported video URLs to Supabase Edge Functions (Option 3) so the user
 * can stay in Instagram. Auth token is synced from the host app via App Group UserDefaults.
 */
function withShareExtensionDirectImport(config, shareIntentParams = {}) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const bundleId = cfg.ios?.bundleIdentifier;
      if (!bundleId) {
        console.warn('[withShareExtensionDirectImport] Missing ios.bundleIdentifier.');
        return cfg;
      }

      const appGroup = shareIntentParams.iosAppGroupIdentifier || `group.${bundleId}`;
      const schemeRaw = cfg.scheme;
      const scheme = Array.isArray(schemeRaw) ? schemeRaw[0] : schemeRaw;
      if (!scheme) {
        console.warn('[withShareExtensionDirectImport] Missing scheme; skipping ShareViewController override.');
        return cfg;
      }

      const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      const importUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/import-video-job` : '';

      if (!supabaseUrl || !anonKey) {
        console.warn(
          '[withShareExtensionDirectImport] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY at prebuild. ' +
          'The share extension will compile with empty endpoint and fall back to opening the host app. ' +
          'Set these env vars (EAS profile env or local shell) before building.'
        );
      } else {
        console.log('[withShareExtensionDirectImport] endpoint =', importUrl);
      }

      const extFolder = getShareExtensionFolderName(shareIntentParams.iosShareExtensionName);
      const templatePath = path.join(__dirname, 'templates', 'ShareViewController.memo-trip.swift');

      if (!fs.existsSync(templatePath)) {
        console.warn('[withShareExtensionDirectImport] Template missing:', templatePath);
        return cfg;
      }

      let swift = fs.readFileSync(templatePath, 'utf8');
      swift = swift
        .replaceAll('<GROUPIDENTIFIER>', appGroup)
        .replaceAll('<SCHEME>', scheme)
        .replaceAll('<SUPABASE_IMPORT_URL>', importUrl)
        .replaceAll('<SUPABASE_ANON_KEY>', anonKey);

      const dest = path.join(platformRoot, extFolder, 'ShareViewController.swift');
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, swift);
      console.log('[withShareExtensionDirectImport] Wrote ShareViewController.swift for', extFolder);
      return cfg;
    },
  ]);
}

module.exports = withShareExtensionDirectImport;
