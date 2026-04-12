import { Stack } from "expo-router";
import { MemoryProvider } from '../context/MemoryContext';
import './globals.css';
import {AuthProvider} from "@/context/AuthContext";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
      <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
          <MemoryProvider>
              <Stack>
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              </Stack>
          </MemoryProvider>
      </AuthProvider>
          </GestureHandlerRootView>

  );
}