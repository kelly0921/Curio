import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import {
  getPersonalContext,
  listLearningItems,
  updateRecommendationFeedback,
  type ContextSnapshot,
  type LearningItem,
  type LearningPersonalization,
} from '@/lib/curio-api';

type RecommendationTier = LearningPersonalization['recommendationTier'];
type FeedbackAction = 'done' | 'later' | 'not_relevant';

const SECTION_DETAILS: Record<RecommendationTier, { title: string; subtitle: string }> = {
  do_now: { title: 'Do now', subtitle: 'Timely and ready to use' },
  useful_for_goals: { title: 'Useful for your goals', subtitle: 'Relevant to something in progress' },
  worth_remembering: { title: 'Worth remembering', subtitle: 'Keep close, or review before acting' },
};

const TIER_ORDER: RecommendationTier[] = ['do_now', 'useful_for_goals', 'worth_remembering'];

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function evidenceLabel(status: LearningPersonalization['evidenceStatus']): string {
  if (status === 'validated') return 'Research checked';
  if (status === 'mixed') return 'Review first';
  if (status === 'opinion') return 'Perspective';
  return 'Source note';
}

function tierFor(personalization: LearningPersonalization): RecommendationTier {
  return personalization.recommendationTier
    ?? (personalization.priority === 'high' ? 'do_now' : personalization.priority === 'medium' ? 'useful_for_goals' : 'worth_remembering');
}

function evidenceFor(item: LearningItem, personalization: LearningPersonalization): LearningPersonalization['evidenceStatus'] {
  if (personalization.evidenceStatus) return personalization.evidenceStatus;
  if (item.card?.researchBrief) return 'validated';
  return item.card?.contentType === 'opinion' || item.card?.contentType === 'personal_experience' ? 'opinion' : 'unresearched';
}

export default function PrioritiesScreen() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      const [nextItems, nextContext] = await Promise.all([listLearningItems(), getPersonalContext()]);
      setItems(nextItems.filter((item) => Boolean(item.card?.personalization)));
      setContext(nextContext);
      setError(null);
    } catch {
      setError('Curio could not refresh your recommendations right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const sections = useMemo(() => TIER_ORDER.map((tier) => ({
    tier,
    ...SECTION_DETAILS[tier],
    data: items.filter((item) => item.card?.personalization && tierFor(item.card.personalization) === tier),
  })).filter((section) => section.data.length > 0), [items]);

  const connection = context?.connections[0] ?? null;

  async function saveFeedback(id: string, action: FeedbackAction) {
    if (updatingId) return;
    setUpdatingId(id);
    setError(null);
    try {
      await updateRecommendationFeedback(id, action);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError('Curio could not save that choice. Try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <SectionList
          contentContainerStyle={styles.content}
          sections={sections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={(
            <View>
              <View style={styles.topbar}>
                <CurioBrand compact />
                <Pressable accessibilityLabel="Personalization settings" onPress={() => router.push('/settings')} style={styles.settingsButton}>
                  <Text style={styles.settingsButtonText}>Context</Text>
                  <Text style={styles.settingsArrow}>→</Text>
                </Pressable>
              </View>
              <Text style={styles.eyebrow}>CURIO, PERSONALLY</Text>
              <Text style={styles.heading}>For you</Text>
              <Text style={styles.intro}>A short list from what you saved, matched to what matters now.</Text>

              {context && (
                <Pressable onPress={() => router.push('/settings')} style={styles.signalStrip}>
                  <View style={styles.signalIcon}><Text style={styles.signalIconText}>✦</Text></View>
                  <View style={styles.signalCopy}>
                    <Text style={styles.signalTitle}>Personalized from {context.records.length} connected signals</Text>
                    <Text style={styles.signalMeta}>{connection?.isDemo ? 'Demo context · tap to review' : 'Synced automatically · tap to review'}</Text>
                  </View>
                  <Text style={styles.signalArrow}>→</Text>
                </Pressable>
              )}

              {error && <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>}
            </View>
          )}
          ListEmptyComponent={loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Finding what matters…</Text></View>
          ) : (
            <View style={[styles.empty, shadows.card]}>
              <Text style={styles.emptyMark}>✦</Text>
              <Text style={styles.emptyTitle}>You’re caught up</Text>
              <Text style={styles.emptyCopy}>New recommendations will appear when a save meaningfully connects to your goals or plans.</Text>
            </View>
          )}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              </View>
              <Text style={styles.count}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const personalization = item.card?.personalization;
            if (!item.card || !personalization) return null;
            const isUpdating = updatingId === item.id;
            const evidenceStatus = evidenceFor(item, personalization);
            const needsReview = evidenceStatus === 'mixed';
            return (
              <View style={[styles.recommendationCard, shadows.card]}>
                <Pressable
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                  style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}>
                  <View style={styles.tagRow}>
                    <View style={styles.domainPill}><Text style={styles.domainPillText}>{label(personalization.domain)}</Text></View>
                    <View style={[styles.evidencePill, needsReview && styles.evidencePillReview]}>
                      <Text style={[styles.evidencePillText, needsReview && styles.evidencePillTextReview]}>{evidenceLabel(evidenceStatus)}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{item.card.title}</Text>
                  <Text style={styles.whyLabel}>WHY IT MATTERS</Text>
                  <Text style={styles.whyNow}>{personalization.whyNow}</Text>
                  <View style={[styles.nextBlock, needsReview && styles.nextBlockReview]}>
                    <Text style={styles.nextLabel}>{needsReview ? 'BEFORE YOU ACT' : 'ONE NEXT STEP'}</Text>
                    <Text style={styles.nextText}>{personalization.nextStep}</Text>
                  </View>
                </Pressable>

                <View style={styles.feedbackRow}>
                  <Text style={styles.feedbackPrompt}>Tune this list</Text>
                  {isUpdating ? <ActivityIndicator color={colors.ink} size="small" /> : (
                    <View style={styles.feedbackActions}>
                      <Pressable onPress={() => void saveFeedback(item.id, 'done')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Done</Text></Pressable>
                      <Pressable onPress={() => void saveFeedback(item.id, 'later')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Later</Text></Pressable>
                      <Pressable onPress={() => void saveFeedback(item.id, 'not_relevant')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Not relevant</Text></Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      </SafeAreaView>
      <CurioBottomBar active="priorities" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 34, paddingHorizontal: 18 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 27, paddingTop: 12 },
  settingsButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 8 },
  settingsButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  settingsArrow: { color: colors.ink, fontSize: 12 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 51, fontWeight: '700', letterSpacing: -2.2, lineHeight: 57, marginTop: 2 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 5, maxWidth: 340 },
  signalStrip: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 19, flexDirection: 'row', marginTop: 22, padding: 13 },
  signalIcon: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 13, height: 34, justifyContent: 'center', width: 34 },
  signalIconText: { color: colors.ink, fontSize: 15 },
  signalCopy: { flex: 1, marginLeft: 10 },
  signalTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800' },
  signalMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  signalArrow: { color: colors.ink, fontSize: 14 },
  errorCard: { backgroundColor: '#F3DFD4', borderRadius: 16, marginTop: 12, padding: 13 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, paddingTop: 32 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.7 },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 3 },
  count: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, paddingBottom: 2 },
  recommendationCard: { backgroundColor: colors.surface, borderRadius: 25, marginBottom: 14, overflow: 'hidden' },
  cardBody: { padding: 19 },
  pressed: { opacity: 0.82 },
  tagRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  domainPill: { backgroundColor: colors.peach, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  domainPillText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  evidencePill: { backgroundColor: '#DCE9D8', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  evidencePillReview: { backgroundColor: colors.butter },
  evidencePillText: { color: colors.success, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  evidencePillTextReview: { color: colors.ink },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, lineHeight: 30, marginTop: 15 },
  whyLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.9, marginTop: 17 },
  whyNow: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 6 },
  nextBlock: { backgroundColor: colors.butter, borderRadius: 16, marginTop: 15, padding: 13 },
  nextBlockReview: { backgroundColor: colors.peach },
  nextLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  nextText: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 5 },
  feedbackRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 16, paddingVertical: 9 },
  feedbackPrompt: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  feedbackActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  feedbackButton: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  feedbackText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, marginTop: 30, padding: 30 },
  emptyMark: { color: colors.ink, fontSize: 23 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', marginTop: 10 },
  emptyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' },
});
