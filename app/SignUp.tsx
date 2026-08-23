import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import {Link, useRouter} from "expo-router";
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/context/ThemeContext';

const MIN_NAME_LEN = 3;
const MAX_NAME_LEN = 40;

/** Trims and collapses internal whitespace; preserves casing. */
function normalizeDisplayName(raw: string): string | null {
    const collapsed = raw.trim().replace(/\s+/g, ' ');
    if (collapsed.length < MIN_NAME_LEN || collapsed.length > MAX_NAME_LEN) {
        return null;
    }
    if (!/^[\p{L}\p{M}\p{N} \-']+$/u.test(collapsed)) {
        return null;
    }
    if (!/\p{L}/u.test(collapsed)) {
        return null;
    }
    return collapsed;
}

export default function SignUpScreen() {

    const router = useRouter();
    const { theme } = useAppTheme();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

async function handleSignUp() {
    const displayName = normalizeDisplayName(username);
    if (!displayName) {
        Alert.alert(
            'Invalid username',
            `Use ${MIN_NAME_LEN}-${MAX_NAME_LEN} characters: letters, numbers, spaces, hyphens, or apostrophes (include at least one letter).`,
        );
        return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
        Alert.alert("Error", "Please fill in all fields");
        return;
    }

    setLoading(true);

    const { data: available, error: rpcError } = await supabase.rpc('username_is_available', {
        p_username: displayName,
    });

    if (rpcError) {
        Alert.alert('Could not verify username', rpcError.message);
        setLoading(false);
        return;
    }

    if (available !== true) {
        Alert.alert(
            'Username taken',
            'That username is already in use. Please choose a different one.',
        );
        setLoading(false);
        return;
    }

    const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: password,
        options: {
            data: { username: displayName },
        },
    });

    if (error) {
        Alert.alert("Signup Error", error.message);
    } else {
        Alert.alert("Success!", "Check your email for the confirmation link.");
        router.push('/Login');
    }
    setLoading(false);
}



    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
            <View className="flex-1 px-6 pt-2">
                <Text className="text-3xl font-bold mb-2" style={{ color: theme.colors.text }}>Create Account</Text>
                <Text className="mb-8" style={{ color: theme.colors.textMuted }}>Join MemoTrip to save your travels.</Text>

                <View className="mb-8">
                    <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Username</Text>
                    <TextInput
                        className="border p-4 rounded-2xl"
                        style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                        placeholder="Bon Jovi"
                        placeholderTextColor={theme.colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={username}
                        onChangeText={setUsername}
                    />
                </View>

                <View className="mb-8">
                    <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Email Address</Text>
                    <TextInput
                        className="border p-4 rounded-2xl"
                        style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                        placeholder="john@example.com"
                        placeholderTextColor={theme.colors.placeholder}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                    />
                </View>

                <View className="mb-4">
                    <Text className="font-medium mb-2" style={{ color: theme.colors.textSecondary }}>Password</Text>
                    <TextInput
                        className="border p-4 rounded-2xl"
                        style={{ backgroundColor: theme.colors.input, borderColor: theme.colors.border, color: theme.colors.text }}
                        placeholder="********"
                        placeholderTextColor={theme.colors.placeholder}
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />
                </View>

                <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={loading}
                    className="mx-auto h-[55px] w-[275px] bg-blue-600 p-4 rounded-2xl items-center justify-center shadow-lg"
                >
                    {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Sign Up</Text>}
                </TouchableOpacity>

                <Link href="/Login" asChild>
                    <TouchableOpacity className="mt-6 items-center">
                        <Text style={{ color: theme.colors.textMuted }}>Already have an account? <Text className="font-bold" style={{ color: theme.colors.accent }}>Log In</Text></Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </SafeAreaView>
    );
}