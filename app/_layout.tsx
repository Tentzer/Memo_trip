import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { AppSplash } from "@/components/AppSplash";
import ShareIntentHandler from "@/components/ShareIntentHandler";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MemoryProvider } from '../context/MemoryContext';
import { ImportQueueProvider } from '../context/ImportQueueContext';
import './globals.css';

// AuthProvider is lifted above RootLayoutContent so it can use useAuth()
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShareIntentProvider
          options={{
            scheme: "memo-trip",
            // ShareIntentHandler owns navigation; avoid REPLACE on nested tabs here.
            onResetShareIntent: () => {},
          }}
        >
          <RootLayoutContent />
        </ShareIntentProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Splash state machine:
//   'splash'    → AppSplash animation is playing
//   'covering'  → Animation done, opaque cover holds while navigation flies
//   'fading'    → Route settled; cover fades out over ~400ms so the map can
//                 finish rendering underneath before it's fully exposed
//   'done'      → Cover fully gone, app fully visible
type SplashState = 'splash' | 'covering' | 'fading' | 'done';

function RootLayoutContent() {
  const { isDarkMode, theme } = useAppTheme();
  const { user, loading } = useAuth();
  const { hasShareIntent, isReady: shareIntentReady } = useShareIntentContext();
  const segments = useSegments();
  const [splashState, setSplashState] = useState<SplashState>('splash');
  const [dataReady, setDataReady] = useState(false);
  const coverOpacity = useSharedValue(1);
  const coverAnimatedStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.value }));

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  // After splash: land on map unless opened via share sheet (ShareIntentHandler owns navigation).
  useEffect(() => {
    if (splashState !== 'covering') return;
    if (loading) return;
    if (shareIntentReady && hasShareIntent) return;
    router.navigate('/onboarding/Home');
  }, [splashState, loading, shareIntentReady, hasShareIntent, segments]);

  // Once the route settles on onboarding, fade the cover out so Google Maps
  // has time to finish rendering tiles underneath before it's fully exposed.
  useEffect(() => {
    if (splashState === 'covering' && segments[0] === 'onboarding') {
      setSplashState('fading');
      coverOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(setSplashState)('done');
      });
    }
  }, [segments, splashState, coverOpacity]);

  const appReadyForShare = splashState !== 'splash';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ImportQueueProvider>
      <ShareIntentHandler appReady={appReadyForShare} />
      <MemoryProvider ready={!!user && dataReady}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
        <Stack screenOptions={{ headerShown: false }}>
          {/* animation:'none' prevents the exit transition from showing the
              login page while the cover is still being removed */}
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="account" />
        </Stack>

        {splashState === 'splash' && (
          <AppSplash
            onDone={() => setSplashState('covering')}
            onMeasured={() => setDataReady(true)}
          />
        )}

        {(splashState === 'covering' || splashState === 'fading') && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.colors.background, zIndex: 998 },
              coverAnimatedStyle,
            ]}
          />
        )}
      </MemoryProvider>
      </ImportQueueProvider>
    </GestureHandlerRootView>
  );
}
