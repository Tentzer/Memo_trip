import * as AppleAuthentication from 'expo-apple-authentication';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialSignInResult =
    | { ok: true }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled: false; error: string };

const OAUTH_REDIRECT = makeRedirectUri({ scheme: 'memo-trip', path: 'auth/callback' });

async function createSessionFromRedirectUrl(url: string): Promise<{ error: string | null }> {
    const { params, errorCode } = QueryParams.getQueryParams(url);
    if (errorCode) {
        return { error: errorCode };
    }

    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    if (accessToken) {
        const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? '',
        });
        return { error: error?.message ?? null };
    }

    const code = params.code;
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return { error: error?.message ?? null };
    }

    return { error: 'Sign in redirect did not include session tokens.' };
}

async function signInWithOAuthProvider(provider: 'google'): Promise<SocialSignInResult> {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: OAUTH_REDIRECT,
            skipBrowserRedirect: true,
        },
    });

    if (error || !data.url) {
        return { ok: false, cancelled: false, error: error?.message ?? 'Could not start sign in.' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
    if (result.type === 'cancel' || result.type === 'dismiss') {
        return { ok: false, cancelled: true };
    }
    if (result.type !== 'success') {
        return { ok: false, cancelled: false, error: 'Sign in was not completed.' };
    }

    const sessionError = await createSessionFromRedirectUrl(result.url);
    if (sessionError.error) {
        return { ok: false, cancelled: false, error: sessionError.error };
    }
    return { ok: true };
}

export async function signInWithGoogle(): Promise<SocialSignInResult> {
    return signInWithOAuthProvider('google');
}

export async function signInWithApple(): Promise<SocialSignInResult> {
    if (Platform.OS !== 'ios') {
        return { ok: false, cancelled: false, error: 'Apple Sign In is only available on iOS.' };
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
        return { ok: false, cancelled: false, error: 'Apple Sign In is not available on this device.' };
    }

    try {
        const rawNonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            rawNonce,
        );

        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: hashedNonce,
        });

        if (!credential.identityToken) {
            return { ok: false, cancelled: false, error: 'Apple Sign In did not return an identity token.' };
        }

        const { error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
            nonce: rawNonce,
        });

        if (error) {
            return { ok: false, cancelled: false, error: error.message };
        }

        if (credential.fullName) {
            const parts = [credential.fullName.givenName, credential.fullName.familyName]
                .filter((part): part is string => Boolean(part?.trim()));
            const fullName = parts.join(' ').trim();
            if (fullName) {
                await supabase.auth.updateUser({ data: { full_name: fullName } });
            }
        }

        return { ok: true };
    } catch (e) {
        if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
            return { ok: false, cancelled: true };
        }
        const message = e instanceof Error ? e.message : 'Apple Sign In failed.';
        return { ok: false, cancelled: false, error: message };
    }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    return AppleAuthentication.isAvailableAsync();
}
