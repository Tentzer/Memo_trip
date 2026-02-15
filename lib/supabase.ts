import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. These are your "Backstage Passes" from the Supabase Dashboard
// Use EXPO_PUBLIC_ prefix so Expo can read them from your .env file
const supabaseUrl = 'https://rvxbupuzvrupdenxbbzl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eGJ1cHV6dnJ1cGRlbnhiYnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Mjg4MzAsImV4cCI6MjA4NjMwNDgzMH0.3JzwdOfp27F0C9DXzlUvPa7lLXvdrHk_NkOvVMwNc_E';

// 2. Initialize the client with "Memory" (AsyncStorage)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});