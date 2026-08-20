import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import { useCurioAuth } from '@/lib/curio-auth';
import { getPersonalContext, type ContextSnapshot } from '@/lib/curio-api';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export default function SettingsScreen() {
  const auth = useCurioAuth();
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setContext(await getPersonalContext());
      setError(null);
    } catch {
      setError('Curio could not load your connected context right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const domains = useMemo(() => [...new Set(context?.records.map((record) => record.domain) ?? [])], [context]);
  const connection = context?.connections[0] ?? null;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.topbar}>
        <Pressable accessibilityLabel="Back to For You" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <CurioBrand compact />
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>PERSONALIZATION</Text>
        <Text style={styles.heading}>Your context</Text>
        <Text style={styles.intro}>Curio uses connected information quietly in the background, then includes only the signals that match each save.</Text>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Loading context…</Text></View>
        ) : error ? (
          <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
        ) : connection && context ? (
          <View style={[styles.connectionCard, shadows.card]}>
            <View style={styles.connectionHeader}>
              <View style={styles.connectionCopy}>
                <Text style={styles.connectionLabel}>{connection.isDemo ? 'DEMO CONNECTION' : 'CONNECTED'}</Text>
                <Text style={styles.connectionName}>{connection.displayName}</Text>
              </View>
              <View style={styles.livePill}><Text style={styles.livePillText}>LIVE</Text></View>
            </View>
            <Text style={styles.connectionMeta}>{context.records.length} signals · Synced automatically</Text>
            <View style={styles.domainRow}>
              {domains.map((domain) => <View key={domain} style={styles.domainPill}><Text style={styles.domainPillText}>{label(domain)}</Text></View>)}
            </View>
            {connection.isDemo && <Text style={styles.demoNote}>These are example priorities and preferences. They let us test the experience before a personal workspace is connected.</Text>}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.eyebrow}>HOW CURIO USES IT</Text>
          <Text style={styles.sectionTitle}>Useful, without oversharing</Text>
          <View style={styles.rule}><Text style={styles.ruleNumber}>1</Text><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>Match the domain</Text><Text style={styles.ruleText}>Finance context stays with finance saves; travel context stays with travel.</Text></View></View>
          <View style={styles.rule}><Text style={styles.ruleNumber}>2</Text><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>Check the evidence</Text><Text style={styles.ruleText}>Unresolved or high-stakes claims are sent to review instead of becoming an action.</Text></View></View>
          <View style={styles.rule}><Text style={styles.ruleNumber}>3</Text><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>Show the receipt</Text><Text style={styles.ruleText}>Every recommendation can show exactly which signals influenced it.</Text></View></View>
        </View>

        <View style={[styles.nextConnector, shadows.card]}>
          <View><Text style={styles.nextLabel}>NEXT CONNECTION</Text><Text style={styles.nextTitle}>Notion workspace</Text></View>
          <View style={styles.plannedPill}><Text style={styles.plannedText}>PLANNED</Text></View>
          <Text style={styles.nextCopy}>Once connected, Curio can sync goals, plans, constraints, and preferences automatically. No repeated profile setup.</Text>
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.accountEmail}>{auth.session?.user.email ?? 'Personal beta mode'}</Text>
          <Text style={styles.accountCopy}>{auth.configured ? 'Your Curio library is isolated to this signed-in account.' : 'Passwordless accounts are ready in the app and will appear when Supabase Auth is configured.'}</Text>
          {accountError && <Text style={styles.accountError}>{accountError}</Text>}
          {auth.configured && (
            <Pressable
              disabled={signingOut}
              onPress={() => {
                setSigningOut(true);
                setAccountError(null);
                void auth.signOut().catch((signOutError: unknown) => {
                  setAccountError(signOutError instanceof Error ? signOutError.message : 'Curio could not sign you out.');
                }).finally(() => setSigningOut(false));
              }}
              style={styles.signOutButton}>
              {signingOut ? <ActivityIndicator color={colors.ink} size="small" /> : <Text style={styles.signOutText}>Sign out</Text>}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  backText: { color: colors.ink, fontSize: 21 },
  spacer: { width: 36 },
  content: { paddingBottom: 44, paddingHorizontal: 18, paddingTop: 22 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 45, fontWeight: '700', letterSpacing: -1.8, lineHeight: 49, marginTop: 4 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 9 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 45 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  errorCard: { backgroundColor: '#F3DFD4', borderRadius: 18, marginTop: 22, padding: 16 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 11 },
  connectionCard: { backgroundColor: colors.dark, borderRadius: 25, marginTop: 25, padding: 20 },
  connectionHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  connectionCopy: { flex: 1, paddingRight: 10 },
  connectionLabel: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  connectionName: { color: colors.surface, fontFamily: fonts.display, fontSize: 22, fontWeight: '700', marginTop: 4 },
  livePill: { backgroundColor: '#DCE9D8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  livePillText: { color: colors.success, fontFamily: fonts.body, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  connectionMeta: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 9, marginTop: 9 },
  domainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  domainPill: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  domainPillText: { color: colors.surface, fontFamily: fonts.body, fontSize: 8, fontWeight: '800' },
  demoNote: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 14 },
  section: { paddingTop: 38 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginBottom: 8, marginTop: 4 },
  rule: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, paddingVertical: 16 },
  ruleNumber: { color: colors.muted, fontFamily: fonts.display, fontSize: 18, fontWeight: '700', width: 20 },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
  ruleText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  nextConnector: { backgroundColor: colors.surface, borderRadius: 23, marginTop: 24, padding: 19 },
  nextLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  nextTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: '700', marginTop: 4 },
  plannedPill: { alignSelf: 'flex-start', backgroundColor: colors.lilac, borderRadius: 11, marginTop: 11, paddingHorizontal: 9, paddingVertical: 6 },
  plannedText: { color: colors.ink, fontFamily: fonts.body, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  nextCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 13 },
  accountSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 34, paddingTop: 26 },
  accountEmail: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: '700', marginTop: 7 },
  accountCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 7 },
  accountError: { color: colors.danger, fontFamily: fonts.body, fontSize: 11, marginTop: 10 },
  signOutButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.line, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 42, minWidth: 92, paddingHorizontal: 15 },
  signOutText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
});
