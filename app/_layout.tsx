import { Stack } from "expo-router";
import { MemoryProvider } from '../context/MemoryContext';
import './globals.css';
import {AuthProvider} from "@/context/AuthContext";

export default function RootLayout() {
  return (
      <AuthProvider>
          <MemoryProvider>
              <Stack>
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              </Stack>
          </MemoryProvider>
      </AuthProvider>

  );
}