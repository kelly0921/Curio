import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import {
  getPersonalContext,
  listLearningItems,
  type ContextSnapshot,
  type LearningItem,
} from '@/lib/curio-api';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function relativeSync(value: string | null): string {
  if (!value) return 'Waiting for first sync';
  return 'Synced automatically';
}

export default function PrioritiesScreen() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      const [nextItems, nextContext] = await Promise.all([listLearningItems(), getPersonalContext()]);
      setItems(nextItems.filter((item) => Boolean(item.card?.personalization)));
      setContext(nextContext);
      setError(null);
    } catch {
      setError('Curio could not load connected context right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const domains = useMemo(() => [...new Set(context?.records.map((record) => record.domain) ?? [])], [context]);
  const connection = context?.connections[0] ?? null;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlatList
          contentContainerStyle={styles.content}
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={(
            <View>
              <View style={styles.topbar}><CurioBrand compact /></View>
              <Text style={styles.eyebrow}>CURIO, PERSONALLY</Text>
              <Text style={styles.heading}>For you</Text>
              <Text style={styles.intro}>Your saves, ranked against what is happening across your connected life.</Text>

              {connection && context && (
                <View style={[styles.connectionCard, shadows.card]}>
                  <View style={styles.connectionHeader}>
                    <View>
                      <Text style={styles.connectionLabel}>{connection.isDemo ? 'DEMO CONNECTION' : 'CONNECTED'}</Text>
                      <Text style={styles.connectionName}>{connection.displayName}</Text>
                    </View>
                    <View style={styles.connectedPill}><Text style={styles.connectedPillText}>LIVE</Text></View>
                  </View>
                  <Text style={styles.connectionMeta}>{context.records.length} context signals · {relativeSync(connection.lastSyncedAt)}</Text>
                  <View style={styles.domainRow}>
                    {domains.map((domain) => <View key={domain} style={styles.domainPill}><Text style={styles.domainPillText}>{label(domain)}</Text></View>)}
                  </View>
                  <Text style={styles.demoNote}>{connection.isDemo ? 'These example records let us test automatic personalization before connecting Notion.' : 'Curio selects only the relevant domain for each save.'}</Text>
                </View>
              )}

              {error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>}
              <View style={styles.sectionHeader}>
                <View><Text style={styles.eyebrow}>CURRENT PRIORITIES</Text><Text style={styles.sectionTitle}>What matters now</Text></View>
                <Text style={styles.count}>{items.length}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Connecting the dots…</Text></View>
          ) : (
            <View style={styles.empty}><Text style={styles.emptyTitle}>No priorities yet</Text><Text style={styles.emptyCopy}>Save a learning card and Curio will match it against connected context automatically.</Text></View>
          )}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          renderItem={({ item, index }) => {
            const personalization = item.card?.personalization;
            if (!item.card || !personalization) return null;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                style={({ pressed }) => [styles.priorityCard, shadows.card, pressed && styles.pressed]}>
                <View style={styles.priorityTop}>
                  <View style={[styles.rank, { backgroundColor: [colors.peach, colors.sage, colors.sky][index % 3] }]}><Text style={styles.rankText}>{index + 1}</Text></View>
                  <View style={styles.priorityTags}>
                    <Text style={styles.priorityLabel}>{personalization.priority.toUpperCase()} PRIORITY</Text>
                    <Text style={styles.domainLabel}>{label(personalization.domain)}</Text>
                  </View>
                  <Text style={styles.score}>{personalization.priorityScore}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.card.title}</Text>
                <Text style={styles.whyNow}>{personalization.whyNow}</Text>
                <View style={styles.nextBlock}><Text style={styles.nextLabel}>NEXT STEP</Text><Text style={styles.nextText}>{personalization.nextStep}</Text></View>
                <Text style={styles.contextCount}>{personalization.contextUsed.length} connected signal{personalization.contextUsed.length === 1 ? '' : 's'} used →</Text>
              </Pressable>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
      <CurioBottomBar active="priorities" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 32, paddingHorizontal: 18 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 27, paddingTop: 12 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 51, fontWeight: '700', letterSpacing: -2.2, lineHeight: 57, marginTop: 2 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 5, maxWidth: 340 },
  connectionCard: { backgroundColor: colors.dark, borderRadius: 25, marginTop: 24, padding: 20 },
  connectionHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  connectionLabel: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  connectionName: { color: colors.surface, fontFamily: fonts.display, fontSize: 21, fontWeight: '700', marginTop: 4 },
  connectedPill: { backgroundColor: '#DCE9D8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  connectedPillText: { color: colors.success, fontFamily: fonts.body, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  connectionMeta: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 10, marginTop: 9 },
  domainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  domainPill: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  domainPillText: { color: colors.surface, fontFamily: fonts.body, fontSize: 8, fontWeight: '800' },
  demoNote: { color: '#C6C3B8', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 14 },
  errorCard: { backgroundColor: '#F3DFD4', borderRadius: 16, marginTop: 14, padding: 14 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 11 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, marginTop: 35 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.7, marginTop: 3 },
  count: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, paddingBottom: 4 },
  priorityCard: { backgroundColor: colors.surface, borderRadius: 24, marginBottom: 14, padding: 20 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  priorityTop: { alignItems: 'center', flexDirection: 'row' },
  rank: { alignItems: 'center', borderRadius: 15, height: 31, justifyContent: 'center', width: 31 },
  rankText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '900' },
  priorityTags: { flex: 1, marginLeft: 10 },
  priorityLabel: { color: colors.success, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  domainLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, marginTop: 2 },
  score: { color: colors.muted, fontFamily: fonts.display, fontSize: 18, fontWeight: '700' },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29, marginTop: 16 },
  whyNow: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 9 },
  nextBlock: { backgroundColor: colors.butter, borderRadius: 16, marginTop: 16, padding: 13 },
  nextLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 7, fontWeight: '900', letterSpacing: 0.9 },
  nextText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 5 },
  contextCount: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', marginTop: 14 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, padding: 28 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: '700' },
  emptyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
});
