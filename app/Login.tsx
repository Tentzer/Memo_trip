import { AuthScreenBackground } from '@/components/AuthScreenBackground';
import { GoogleWord } from '@/components/GoogleWord';
import { useAppTheme } from '@/context/ThemeContext';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '@/lib/socialAuth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type LoadingMode = 'email' | 'apple' | 'google' | null;

export default function LoginScreen() {
    const router = useRouter();
    const { theme, isDarkMode } = useAppTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState<LoadingMode>(null);
    const [showAppleSignIn, setShowAppleSignIn] = useState(false);

    useEffect(() => {
        void isAppleSignInAvailable().then(setShowAppleSignIn);
    }, []);

    const handleBack = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
        }
    }, [router]);

    const finishSignIn = useCallback(() => {
        router.replace('/onboarding/Home');
    }, [router]);

    const handleSocialResult = useCallback((provider: string, result: Awaited<ReturnType<typeof signInWithGoogle>>) => {
        if (result.ok) {
            finishSignIn();
            return;
        }
        if (result.cancelled) return;
        Alert.alert(`${provider} Sign In failed`, result.error);
    }, [finishSignIn]);

    async function handleLogin() {
        if (!email || !password) {
            Alert.alert('Error', 'Please enter both email and password');
            return;
        }

        setLoading('email');
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            Alert.alert('Login Failed', error.message);
        } else {
            finishSignIn();
        }
        setLoading(null);
    }

    const handleAppleSignIn = useCallback(async () => {
        if (loading !== null) return;
        setLoading('apple');
        const result = await signInWithApple();
        setLoading(null);
        handleSocialResult('Apple', result);
    }, [handleSocialResult, loading]);

    const handleGoogleSignIn = useCallback(async () => {
        if (loading !== null) return;
        setLoading('google');
        const result = await signInWithGoogle();
        setLoading(null);
        handleSocialResult('Google', result);
    }, [handleSocialResult, loading]);

    const isBusy = loading !== null;

    return (
        <AuthScreenBackground>
            <View className="flex-1 px-6">
                {router.canGoBack() ? (
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        onPress={handleBack}
                        hitSlop={12}
                        className="mt-2 self-start p-2 -ml-2"
                    >
                        <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
                    </TouchableOpacity>
                ) : (
                    <View className="mt-2 h-10" />
                )}

                <View className="pt-14">
                    <Text className="text-3xl font-bold mb-2" style={{ color: theme.colors.text }}>Log in</Text>
                    <Text className="mb-8" style={{ color: theme.colors.textMuted }}>
                        Welcome back — ready to explore?
                    </Text>

                    <View className="mb-4">
                        <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Email address</Text>
                        <TextInput
                            className="border p-4 rounded-2xl"
                            style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                            placeholder="you@example.com"
                            placeholderTextColor={theme.colors.placeholder}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View className="mb-8">
                        <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Password</Text>
                        <TextInput
                            className="border p-4 rounded-2xl"
                            style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                            placeholder="Enter your password"
                            placeholderTextColor={theme.colors.placeholder}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={handleLogin}
                        disabled={isBusy}
                        className="mx-auto h-[55px] w-[275px] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg"
                    >
                        {loading === 'email' ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text className="text-white font-bold text-lg">Sign In</Text>
                        )}
                    </TouchableOpacity>

                    <View className="flex-row items-center my-6 mx-auto w-[275px]">
                        <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.border }} />
                        <Text className="mx-4 text-sm" style={{ color: theme.colors.textMuted }}>or</Text>
                        <View className="flex-1 h-px" style={{ backgroundColor: theme.colors.border }} />
                    </View>

                    {showAppleSignIn && (
                        <TouchableOpacity
                            onPress={handleAppleSignIn}
                            disabled={isBusy}
                            className="mx-auto mb-3 h-[55px] w-[275px] flex-row items-center justify-center rounded-2xl shadow-lg"
                            style={{
                                backgroundColor: isDarkMode ? '#ffffff' : '#000000',
                            }}
                        >
                            {loading === 'apple' ? (
                                <ActivityIndicator color={isDarkMode ? '#000000' : '#ffffff'} />
                            ) : (
                                <>
                                    <Ionicons
                                        name="logo-apple"
                                        size={22}
                                        color={isDarkMode ? '#000000' : '#ffffff'}
                                    />
                                    <Text
                                        className="ml-2 font-bold text-lg"
                                        style={{ color: isDarkMode ? '#000000' : '#ffffff' }}
                                    >
                                        Sign in with Apple
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        onPress={handleGoogleSignIn}
                        disabled={isBusy}
                        className="mx-auto h-[55px] w-[275px] flex-row items-center justify-center rounded-2xl border"
                        style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}
                    >
                        {loading === 'google' ? (
                            <ActivityIndicator color={theme.colors.text} />
                        ) : (
                            <>
                                <Ionicons name="logo-google" size={22} color="#4285F4" />
                                <Text className="ml-2 font-bold text-lg" style={{ color: theme.colors.text }}>
                                    Continue with <GoogleWord />
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Link href="/SignUp" asChild>
                        <TouchableOpacity className="mt-6 items-center" disabled={isBusy}>
                            <Text style={{ color: theme.colors.textMuted }}>
                                Don&apos;t have an account?{' '}
                                <Text className="font-bold" style={{ color: theme.colors.accent }}>Sign Up</Text>
                            </Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </AuthScreenBackground>
    );
}
