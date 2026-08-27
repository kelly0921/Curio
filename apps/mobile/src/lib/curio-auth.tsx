import 'react-native-url-polyfill/auto';

import { createClient, processLock, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fonts, shadows } from '@/constants/curio-theme';
import { parseAuthCallback } from '@/lib/auth-callback';
import { curioAuthStorage } from '@/lib/auth-storage';
import { setCurioAccessToken } from '@/lib/curio-api';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
  || '';
const authConfigured = Boolean(supabaseUrl && supabasePublishableKey);

const supabase: SupabaseClient | null = authConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: curioAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        lock: processLock,
      },
    })
  : null;

interface CurioAuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  error: string | null;
  sendSignInLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const CurioAuthContext = createContext<CurioAuthContextValue | null>(null);

async function completeAuthCallback(url: string): Promise<void> {
  if (!supabase) return;
  const callback = parseAuthCallback(url);
  if (callback.kind === 'none') return;
  if (callback.kind === 'error') throw new Error(callback.message);
  const { error } = callback.kind === 'code'
    ? await supabase.auth.exchangeCodeForSession(callback.code)
    : await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
  if (error) throw error;
}

export function CurioAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setCurioAccessToken(null, false);
      setLoading(false);
      return;
    }

    let active = true;
    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setCurioAccessToken(nextSession?.access_token ?? null, true);
      setLoading(false);
    };
    const initialize = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await completeAuthCallback(initialUrl);
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        applySession(data.session);
      } catch (initializationError) {
        setError(initializationError instanceof Error ? initializationError.message : 'Curio could not restore your session.');
        applySession(null);
      }
    };
    void initialize();

    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void completeAuthCallback(url).catch((linkError: unknown) => {
        setError(linkError instanceof Error ? linkError.message : 'Curio could not finish signing you in.');
      });
    });
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription?.remove();
    };
  }, []);

  const sendSignInLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Curio sign-in is not configured yet.');
    setError(null);
    const redirectTo = Linking.createURL('auth/callback');
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (signInError) throw signInError;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const value = useMemo<CurioAuthContextValue>(() => ({
    configured: authConfigured,
    loading,
    session,
    error,
    sendSignInLink,
    signOut,
  }), [error, loading, sendSignInLink, session, signOut]);

  return <CurioAuthContext.Provider value={value}>{children}</CurioAuthContext.Provider>;
}

export function useCurioAuth(): CurioAuthContextValue {
  const context = useContext(CurioAuthContext);
  if (!context) throw new Error('useCurioAuth must be used inside CurioAuthProvider.');
  return context;
}

export function CurioAuthGate({ children }: PropsWithChildren) {
  const auth = useCurioAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!auth.configured) return children;
  if (auth.loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.ink} /></SafeAreaView>;
  }
  if (auth.session) return children;

  const submit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/u.test(normalized)) {
      setLocalError('Enter the email address on your Curio invite.');
      return;
    }
    setSending(true);
    setLocalError(null);
    try {
      await auth.sendSignInLink(normalized);
      setSent(true);
    } catch (sendError) {
      setLocalError(sendError instanceof Error ? sendError.message : 'Curio could not send the sign-in link.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centered}>
        <View style={[styles.card, shadows.card]}>
          <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
          <Text style={styles.eyebrow}>CURIO PRIVATE BETA</Text>
          <Text style={styles.title}>Your saves, kept yours.</Text>
          <Text style={styles.copy}>Enter your invited email. Curio sends one secure link—no password or setup questionnaire.</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            onSubmitEditing={() => void submit()}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />
          {(localError || auth.error) && <Text style={styles.error}>{localError || auth.error}</Text>}
          {sent && <Text style={styles.sent}>If this email is invited, check it on this phone and tap the Curio sign-in link.</Text>}
          <Pressable disabled={sending} onPress={() => void submit()} style={[styles.button, sending && styles.buttonDisabled]}>
            {sending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>{sent ? 'Send another link' : 'Email me a sign-in link'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: 22 },
  loading: { alignItems: 'center', backgroundColor: colors.canvas, flex: 1, justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 30, borderWidth: 1, padding: 24 },
  mark: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 20, height: 40, justifyContent: 'center', marginBottom: 24, width: 40 },
  markText: { color: colors.surface, fontFamily: fonts.display, fontSize: 20 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginBottom: 10 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 32, lineHeight: 37, marginBottom: 12 },
  copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 16, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 16, paddingHorizontal: 16, paddingVertical: 15 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 10 },
  sent: { color: colors.success, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 10 },
  button: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 16, marginTop: 16, minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
});
