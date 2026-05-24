import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider, useAppTheme } from "@/context/ThemeContext";
import { AppSplash } from "@/components/AppSplash";
import ShareIntentHandler from "@/components/ShareIntentHandler";
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
import ChooseUsernameModal from '@/components/ChooseUsernameModal';
import { ShareIntentProvider } from "expo-share-intent";
import { useRequireUsername } from '@/hooks/useRequireUsername';
import { useEASUpdate } from '@/hooks/useEASUpdate';
import { ImportQueueProvider } from '../context/ImportQueueContext';
import { MemoryProvider } from '../context/MemoryContext';
import './globals.css';

function ShareIntentRoot() {
  const { user } = useAuth();

  return (
    <ShareIntentProvider
      options={{
        scheme: "memo-trip",
        onResetShareIntent: () => {
          router.replace(user ? '/onboarding/Home' : '/Login');
        },
      }}
    >
      <RootLayoutContent />
    </ShareIntentProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShareIntentRoot />
      </AuthProvider>
    </ThemeProvider>
  );
}

type SplashState = 'splash' | 'covering' | 'fading' | 'done';

function RootLayoutContent() {
  useEASUpdate();
  const { isDarkMode, theme } = useAppTheme();
  const { user, loading } = useAuth();
  const { needsUsername, refresh: refreshUsername } = useRequireUsername();
  const segments = useSegments();
  const [splashState, setSplashState] = useState<SplashState>('splash');
  const [dataReady, setDataReady] = useState(false);
  const coverOpacity = useSharedValue(1);
  const coverAnimatedStyle = useAnimatedStyle(() => ({ opacity: coverOpacity.value }));

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  useEffect(() => {
    if (splashState !== 'covering') return;
    if (loading) return;
    router.replace(user ? '/onboarding/Home' : '/Login');
  }, [splashState, loading, user]);

  useEffect(() => {
    if (loading) return;
    const route = segments[0];
    if (!user && (route === 'onboarding' || route === 'account')) {
      router.replace('/Login');
    }
  }, [loading, user, segments]);

  useEffect(() => {
    const route = segments[0];
    const readyRoute =
      route === 'onboarding' || route === 'Login' || route === 'SignUp';
    if (splashState === 'covering' && readyRoute) {
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
            <Stack.Screen name="index" options={{ animation: 'none', gestureEnabled: false }} />
            <Stack.Screen name="shareintent" options={{ animation: 'none', gestureEnabled: false }} />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
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

          {needsUsername ? (
            <ChooseUsernameModal
              visible
              onComplete={() => {
                void refreshUsername();
              }}
            />
          ) : null}
        </MemoryProvider>
      </ImportQueueProvider>
    </GestureHandlerRootView>
  );
}
