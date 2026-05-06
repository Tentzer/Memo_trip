const { AndroidConfig } = require('expo/config-plugins');

/**
 * Injects Maps SDK metadata for react-native-maps (PROVIDER_GOOGLE) on Android.
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for EAS/local builds so it exists at prebuild time.
 * @see https://docs.expo.dev/versions/latest/sdk/map-view/
 */
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    plugins: [...(config.plugins ?? []), AndroidConfig.GoogleMapsApiKey.withGoogleMapsApiKey],
  };
};
