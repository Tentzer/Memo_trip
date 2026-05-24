const fs = require('fs');
const path = require('path');
const plistModule = require('@expo/plist');
const plist = plistModule.default ?? plistModule;
const { withFinalizedMod } = require('@expo/config-plugins');

const SHARE_EXT_FOLDER = 'ShareExtension';
const VIEW_CONTROLLER = 'ShareViewController.swift';
const INFO_PLIST = 'ShareExtension-Info.plist';

function getSupabaseImportUrl() {
  const base = (
    process.env.EXPO_PUBLIC_SUPABASE_URL
    || process.env.SUPABASE_URL
    || ''
  ).replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/import-video-job`;
}

function buildShareViewControllerSource(scheme, groupId) {
  const templatePath = path.join(__dirname, 'templates', 'ShareViewController.memo-trip.swift');
  const template = fs.readFileSync(templatePath, 'utf8');
  const resolvedScheme = Array.isArray(scheme) ? scheme[0] : scheme;
  return template
    .replaceAll('<GROUPIDENTIFIER>', groupId)
    .replaceAll('<SCHEME>', resolvedScheme || 'memo-trip')
    .replaceAll('<SUPABASE_IMPORT_URL>', getSupabaseImportUrl())
    .replaceAll(
      '<SUPABASE_ANON_KEY>',
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    );
}

function patchShareExtensionInfoPlist(platformRoot, scheme) {
  const plistPath = path.join(platformRoot, SHARE_EXT_FOLDER, INFO_PLIST);
  if (!fs.existsSync(plistPath)) {
    console.warn(
      '[withShareExtensionDirectImport] ShareExtension-Info.plist not found; skipping LSApplicationQueriesSchemes.',
    );
    return;
  }

  const resolvedScheme = Array.isArray(scheme) ? scheme[0] : scheme || 'memo-trip';
  const data = plist.parse(fs.readFileSync(plistPath, 'utf8'));
  data.LSApplicationQueriesSchemes = [resolvedScheme];
  fs.writeFileSync(plistPath, plist.build(data), 'utf8');
  console.log('[withShareExtensionDirectImport] Patched LSApplicationQueriesSchemes in', plistPath);
}

/**
 * Replaces expo-share-intent's ShareViewController with Memo Trip direct-import flow.
 * Must run after the expo-share-intent plugin in app.config.js.
 */
function withShareExtensionDirectImport(config) {
  return withFinalizedMod(config, [
    'ios',
    async (cfg) => {
      const bundleId = cfg.ios?.bundleIdentifier || 'com.tentzer.memotrip';
      const groupId = `group.${bundleId}`;
      const scheme = cfg.scheme || 'memo-trip';
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const targetPath = path.join(platformRoot, SHARE_EXT_FOLDER, VIEW_CONTROLLER);

      if (!fs.existsSync(path.dirname(targetPath))) {
        console.warn(
          '[withShareExtensionDirectImport] ShareExtension folder not found; run prebuild with expo-share-intent first.',
        );
        return cfg;
      }

      const source = buildShareViewControllerSource(scheme, groupId);
      fs.writeFileSync(targetPath, source, 'utf8');
      patchShareExtensionInfoPlist(platformRoot, scheme);
      console.log('[withShareExtensionDirectImport] Wrote', targetPath);
      return cfg;
    },
  ]);
}

module.exports = withShareExtensionDirectImport;
