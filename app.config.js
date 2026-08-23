const { AndroidConfig } = require('expo/config-plugins');

/**
 * Injects Google Maps keys for react-native-maps at prebuild (Android + iOS).
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for EAS/local builds.
 * @see https://docs.expo.dev/versions/latest/sdk/map-view/
 */
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const bundleId = config.ios?.bundleIdentifier ?? 'com.tentzer.memotrip';

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      AndroidConfig.GoogleMapsApiKey.withGoogleMapsApiKey,
      [
        'expo-share-intent',
        {
          iosActivationRules: {
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          },
          iosAppGroupIdentifier: `group.${bundleId}`,
        },
      ],
      './plugins/withShareExtensionDirectImport',
    ],
  };
};
