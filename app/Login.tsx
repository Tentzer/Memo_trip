import { useAppTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
    const router = useRouter();
    const { theme } = useAppTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleBack = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/onboarding/Home');
    }, [router]);

    async function handleLogin() {
        if (!email || !password) {
            Alert.alert("Error", "Please enter both email and password");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            Alert.alert("Login Failed", error.message);
        } else {
            router.replace('/onboarding/Home');
        }
        setLoading(false);
    }


    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
            <View className="flex-1 px-6">
                <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={handleBack}
                    hitSlop={12}
                    className="mt-2 self-start p-2 -ml-2"
                >
                    <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
                </TouchableOpacity>

                <View className="pt-14">
                    <Text className="text-3xl font-bold mb-2" style={{ color: theme.colors.text }}>Log in</Text>
                    <Text className="mb-8" style={{ color: theme.colors.textMuted }}>Good to see you are back!</Text>

                    <View className="mb-4">
                        <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Email address</Text>
                        <TextInput
                            className="border p-4 rounded-2xl"
                            style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                            placeholder="Smaul Deek"
                            placeholderTextColor={theme.colors.placeholder}
                            value={email}
                            onChangeText={setEmail}
                        />
                    </View>

                    <View className="mb-8">
                        <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Password</Text>
                        <TextInput
                            className="border p-4 rounded-2xl"
                            style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                            placeholder="Your best password"
                            placeholderTextColor={theme.colors.placeholder}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={handleLogin}
                        disabled={loading}
                        className="mx-auto h-[55px] w-[275px] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg"
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-lg">Sign In</Text>
                        )}
                    </TouchableOpacity>

                    <Link href="/SignUp" asChild>
                        <TouchableOpacity className="mt-6 items-center">
                            <Text style={{ color: theme.colors.textMuted }}>
                                Don&apos;t have an account?{' '}
                                <Text className="font-bold" style={{ color: theme.colors.accent }}>Sign Up</Text>
                            </Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </SafeAreaView>
    );
}