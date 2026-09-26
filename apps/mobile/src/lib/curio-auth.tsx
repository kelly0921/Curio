import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/constants/curio-theme';
import { authClient } from '@/lib/auth-client';
import { setCurioSessionCookie } from '@/lib/curio-api';

const authConfigured = process.env.EXPO_PUBLIC_CURIO_AUTH_ENABLED === 'true';

interface CurioSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
}

interface CurioAuthContextValue {
  configured: boolean;
  loading: boolean;
  session: CurioSession | null;
  error: string | null;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

const CurioAuthContext = createContext<CurioAuthContextValue | null>(null);

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function ConfiguredCurioAuthProvider({ children }: PropsWithChildren) {
  const sessionState = authClient.useSession();
  const [localError, setLocalError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;
    const refreshCookie = setTimeout(() => {
      if (active) setSessionReady(false);
      void authClient.getCookie().then((cookie) => {
        if (active) setCurioSessionCookie(cookie || null, true);
      }).catch(() => {
        if (active) setCurioSessionCookie(null, true);
      }).finally(() => {
        if (active) setSessionReady(true);
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(refreshCookie);
    };
  }, [sessionState.data]);

  const signInWithGoogle = useCallback(async () => {
    setLocalError(null);
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
    });
    if (result.error) {
      const message = authErrorMessage(result.error, 'Curio could not start Google sign-in.');
      setLocalError(message);
      throw new Error(message);
    }
    setCurioSessionCookie(await authClient.getCookie() || null, true);
  }, []);

  const signOut = useCallback(async () => {
    setLocalError(null);
    const result = await authClient.signOut();
    if (result.error) {
      const message = authErrorMessage(result.error, 'Curio could not sign you out.');
      setLocalError(message);
      throw new Error(message);
    }
    setCurioSessionCookie(null, true);
  }, []);

  const value = useMemo<CurioAuthContextValue>(() => ({
    configured: true,
    loading: sessionState.isPending || !sessionReady,
    session: sessionState.data as CurioSession | null,
    error: localError || (sessionState.error
      ? authErrorMessage(sessionState.error, 'Curio could not restore your session.')
      : null),
    signInWithGoogle,
    signOut,
  }), [localError, sessionReady, sessionState.data, sessionState.error, sessionState.isPending, signInWithGoogle, signOut]);

  return <CurioAuthContext.Provider value={value}>{children}</CurioAuthContext.Provider>;
}

const unconfiguredAuth: CurioAuthContextValue = {
  configured: false,
  loading: false,
  session: null,
  error: null,
  signInWithGoogle: async () => { throw new Error('Curio sign-in is not configured yet.'); },
  signOut: async () => {},
};

export function CurioAuthProvider({ children }: PropsWithChildren) {
  if (authConfigured) return <ConfiguredCurioAuthProvider>{children}</ConfiguredCurioAuthProvider>;
  return <CurioAuthContext.Provider value={unconfiguredAuth}>{children}</CurioAuthContext.Provider>;
}

export function useCurioAuth(): CurioAuthContextValue {
  const context = useContext(CurioAuthContext);
  if (!context) throw new Error('useCurioAuth must be used inside CurioAuthProvider.');
  return context;
}

export function CurioAuthGate({ children }: PropsWithChildren) {
  const auth = useCurioAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!auth.configured) return children;
  if (auth.loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.ink} /></SafeAreaView>;
  }
  if (auth.session) return children;

  const submit = async () => {
    setSigningIn(true);
    setLocalError(null);
    try {
      await auth.signInWithGoogle();
    } catch (signInError) {
      setLocalError(authErrorMessage(signInError, 'Curio could not start Google sign-in.'));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centered}>
        <View style={[styles.card, shadows.card]}>
          <View style={styles.mark}><Text style={styles.markText}>C</Text></View>
          <Text style={styles.eyebrow}>CURIO PRIVATE BETA</Text>
          <Text style={styles.title}>Your saves, kept yours.</Text>
          <Text style={styles.copy}>Sign in once with your invited Google account. No password or setup questionnaire.</Text>
          {(localError || auth.error) && <Text style={styles.error}>{localError || auth.error}</Text>}
          <Pressable disabled={signingIn} onPress={() => void submit()} style={[styles.button, signingIn && styles.buttonDisabled]}>
            {signingIn ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Continue with Google</Text>}
          </Pressable>
          <Text style={styles.privacy}>Curio only receives your name and email address for sign-in. It cannot read your inbox or Drive content.</Text>
        </View>
      </View>
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
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  button: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 16, minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 14, fontWeight: '700' },
  privacy: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 14, textAlign: 'center' },
});
