import type { ConfigContext, ExpoConfig } from 'expo/config';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: 'Memo Trip',
    slug: 'memo-trip',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'memotrip',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    icon: './assets/screenshots/MemoTrip_Logo.png',
    splash: {
        image: './assets/screenshots/MemoTrip_Logo.png',
        resizeMode: 'contain',
        backgroundColor: '#f8fafc',
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.roytentzer.memotrip',
        ...(googleMapsApiKey ? { config: { googleMapsApiKey } } : {}),
        infoPlist: {
            NSLocationWhenInUseUsageDescription:
                'Memo Trip uses your location to tag memories and show them on the map.',
            NSCameraUsageDescription:
                'Memo Trip needs camera access to capture photo memories.',
            NSPhotoLibraryUsageDescription:
                'Memo Trip can attach photos from your library when you add place memories.',
        },
    },
    android: {
        adaptiveIcon: {
            foregroundImage: './assets/screenshots/MemoTrip_Logo.png',
            backgroundColor: '#f8fafc',
        },
        package: 'com.roytentzer.memotrip',
        ...(googleMapsApiKey
            ? {
                  config: {
                      googleMaps: {
                          apiKey: googleMapsApiKey,
                      },
                  },
              }
            : {}),
        permissions: [
            'android.permission.CAMERA',
            'android.permission.ACCESS_COARSE_LOCATION',
            'android.permission.ACCESS_FINE_LOCATION',
        ],
    },
    plugins: [
        'expo-router',
        [
            'expo-location',
            {
                locationWhenInUsePermission:
                    'Memo Trip uses your location to tag memories and show the map.',
            },
        ],
        [
            'expo-image-picker',
            {
                photosPermission:
                    'Memo Trip can use photos when you save a place without a place photo.',
                cameraPermission: 'Memo Trip needs the camera to capture new memories.',
            },
        ],
    ],
});
