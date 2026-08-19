import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import {
  getCrossSaveSynthesis,
  getPersonalContext,
  updateForYouFeedback,
  type ContextSnapshot,
  type CrossSaveSynthesis,
  type ForYouFeedback,
  type ForYouLane,
  type ForYouRecommendation,
} from '@/lib/curio-api';

type FeedbackAction = ForYouFeedback['state'];

const LANE_TITLES: Record<ForYouLane, string> = {
  learn_next: 'Learn next',
  use_now: 'Use now',
  worth_revisiting: 'Worth revisiting',
};

function openResource(id: string) {
  router.push({ pathname: '/resource/[id]', params: { id } });
}

function recommendationTone(lane: ForYouLane) {
  if (lane === 'learn_next') return styles.cardButter;
  if (lane === 'use_now') return styles.cardSage;
  return styles.cardPeach;
}

function RecommendationCard({
  recommendation,
  updating,
  onFeedback,
}: {
  recommendation: ForYouRecommendation;
  updating: boolean;
  onFeedback: (action: FeedbackAction) => void;
}) {
  return (
    <View style={[styles.recommendationCard, recommendationTone(recommendation.lane), shadows.card]}>
      <Pressable
        accessibilityHint="Open the living resource behind this suggestion"
        accessibilityLabel={`${LANE_TITLES[recommendation.lane]}: ${recommendation.title}`}
        onPress={() => openResource(recommendation.resourceId)}
        style={({ pressed }) => [styles.recommendationBody, pressed && styles.pressed]}>
        <View style={styles.recommendationTopline}>
          <Text style={styles.recommendationLabel}>{recommendation.label}</Text>
          <Text style={styles.laneNumber}>{recommendation.lane === 'learn_next' ? '01' : recommendation.lane === 'use_now' ? '02' : '03'}</Text>
        </View>
        <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
        <Text style={styles.recommendationPoint}>{recommendation.point}</Text>
        <View style={styles.whyNowBox}>
          <Text style={styles.whyNowLabel}>WHY NOW</Text>
          <Text style={styles.whyNowText}>{recommendation.whyNow}</Text>
        </View>
        <View style={styles.openRow}>
          <Text numberOfLines={1} style={styles.resourceTitle}>{recommendation.resourceTitle}</Text>
          <Text style={styles.openLabel}>{recommendation.actionLabel}</Text>
          <Text style={styles.openArrow}>→</Text>
        </View>
      </Pressable>
      <View style={styles.feedbackRow}>
        <Text style={styles.feedbackPrompt}>Help Curio choose better</Text>
        {updating ? <ActivityIndicator color={colors.ink} size="small" /> : (
          <View style={styles.feedbackActions}>
            <Pressable accessibilityLabel={`Mark ${recommendation.title} done`} onPress={() => onFeedback('done')} style={styles.feedbackButton}>
              <Text style={styles.feedbackText}>Done</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Remind me about ${recommendation.title} later`} onPress={() => onFeedback('later')} style={styles.feedbackButton}>
              <Text style={styles.feedbackText}>Remind me</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Mark ${recommendation.title} not useful`} onPress={() => onFeedback('not_relevant')} style={styles.feedbackButton}>
              <Text style={styles.feedbackText}>Not useful</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default function PrioritiesScreen() {
  const [synthesis, setSynthesis] = useState<CrossSaveSynthesis | null>(null);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      const [nextSynthesis, nextContext] = await Promise.all([
        getCrossSaveSynthesis(),
        getPersonalContext(),
      ]);
      setSynthesis(nextSynthesis);
      setContext(nextContext);
      setError(null);
    } catch {
      setError('Curio could not choose what to surface right now. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const realConnection = context?.connections.find((connection) => !connection.isDemo) ?? null;
  const recommendations = synthesis?.recommendations ?? [];

  async function saveFeedback(recommendation: ForYouRecommendation, action: FeedbackAction) {
    if (updatingId) return;
    setUpdatingId(recommendation.id);
    setError(null);
    try {
      await updateForYouFeedback(recommendation, action);
      setSynthesis((current) => current ? {
        ...current,
        recommendations: current.recommendations.filter((candidate) => candidate.id !== recommendation.id),
      } : current);
      setSynthesis(await getCrossSaveSynthesis());
    } catch {
      setError('Curio could not save that choice. Try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <CurioBrand compact />
            <Pressable accessibilityLabel="Personalization settings" onPress={() => router.push('/settings')} style={styles.settingsButton}>
              <Text style={styles.settingsButtonText}>Context</Text>
              <Text style={styles.settingsArrow}>→</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>CHOSEN FROM YOUR LIBRARY</Text>
          <Text style={styles.heading}>For you</Text>
          <Text style={styles.intro}>A few useful things, shaped quietly by what you save and explore.</Text>

          {realConnection ? (
            <Pressable onPress={() => router.push('/settings')} style={styles.contextStrip}>
              <Text style={styles.contextMark}>✦</Text>
              <Text style={styles.contextText}>Also shaped by {realConnection.displayName}</Text>
              <Text style={styles.contextArrow}>→</Text>
            </Pressable>
          ) : null}

          {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}

          {loading && !synthesis ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.loadingText}>Choosing what is worth your attention…</Text>
            </View>
          ) : null}

          {synthesis ? (
            <View style={[styles.hero, shadows.card]}>
              <View style={styles.heroTopline}>
                <Text style={styles.heroLabel}>TODAY IN CURIO</Text>
                <Text style={styles.heroMark}>✦</Text>
              </View>
              <Text style={styles.heroTitle}>{recommendations.length
                ? `${recommendations.length} thing${recommendations.length === 1 ? '' : 's'} worth your attention`
                : 'You are caught up for now'}</Text>
              <Text style={styles.heroDetail}>{recommendations.length === 3
                ? 'One to learn, one to use, and one worth revisiting—without digging through your saves.'
                : recommendations.length
                  ? 'Curio is only showing the suggestions with a clear reason to return.'
                  : 'Save or explore more resources and Curio will surface the next useful move.'}</Text>
              <View style={styles.libraryPulse}>
                <Text style={styles.libraryPulseLabel}>LIBRARY PULSE</Text>
                <Text style={styles.libraryPulseText}>{synthesis.overview.detail}</Text>
              </View>
            </View>
          ) : null}

          {recommendations.length ? (
            <View style={styles.recommendationsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your next three</Text>
                <Text style={styles.sectionSubtitle}>These change as you open, explore, finish, or dismiss things.</Text>
              </View>
              {recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  onFeedback={(action) => void saveFeedback(recommendation, action)}
                  recommendation={recommendation}
                  updating={updatingId === recommendation.id}
                />
              ))}
            </View>
          ) : null}

          {!loading && synthesis && recommendations.length === 0 ? (
            <View style={[styles.empty, shadows.card]}>
              <Text style={styles.emptyMark}>✓</Text>
              <Text style={styles.emptyTitle}>Nothing needs your attention</Text>
              <Text style={styles.emptyCopy}>Curio will bring something back when a resource changes, a reminder is due, or a useful point remains unexplored.</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <CurioBottomBar active="priorities" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 42, paddingHorizontal: 18 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 27, paddingTop: 12 },
  settingsButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 8 },
  settingsButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  settingsArrow: { color: colors.ink, fontSize: 12 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 51, fontWeight: '700', letterSpacing: -2.2, lineHeight: 57, marginTop: 2 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 5, maxWidth: 350 },
  contextStrip: { alignItems: 'center', alignSelf: 'flex-start', borderColor: colors.line, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 16, paddingHorizontal: 10, paddingVertical: 8 },
  contextMark: { color: colors.ink, fontSize: 11 },
  contextText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  contextArrow: { color: colors.ink, fontSize: 11 },
  errorCard: { backgroundColor: '#F3DFD4', borderRadius: 16, marginTop: 14, padding: 13 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 10, lineHeight: 15 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  hero: { backgroundColor: colors.dark, borderRadius: 28, marginTop: 24, padding: 22 },
  heroTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  heroLabel: { color: colors.butter, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroMark: { color: colors.butter, fontSize: 16 },
  heroTitle: { color: colors.surface, fontFamily: fonts.display, fontSize: 31, fontWeight: '700', letterSpacing: -0.8, lineHeight: 35, marginTop: 27 },
  heroDetail: { color: '#C9C5B9', fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 11 },
  libraryPulse: { borderTopColor: 'rgba(255,255,255,0.16)', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 19, paddingTop: 15 },
  libraryPulseLabel: { color: colors.butter, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  libraryPulseText: { color: '#C9C5B9', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 6 },
  recommendationsSection: { marginTop: 34 },
  sectionHeader: { marginBottom: 15 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 29, fontWeight: '700', letterSpacing: -0.7 },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  recommendationCard: { borderRadius: 26, marginBottom: 16, overflow: 'hidden' },
  cardButter: { backgroundColor: '#E9D99D' },
  cardSage: { backgroundColor: '#C8D8C1' },
  cardPeach: { backgroundColor: '#F0C2A4' },
  recommendationBody: { padding: 19 },
  recommendationTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  recommendationLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  laneNumber: { color: 'rgba(23,23,19,0.38)', fontFamily: fonts.body, fontSize: 9, fontWeight: '900' },
  recommendationTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, lineHeight: 31, marginTop: 14 },
  recommendationPoint: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 9 },
  whyNowBox: { borderLeftColor: colors.ink, borderLeftWidth: 2, marginTop: 15, paddingLeft: 10 },
  whyNowLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  whyNowText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', lineHeight: 15, marginTop: 4 },
  openRow: { alignItems: 'center', borderTopColor: 'rgba(23,23,19,0.15)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 7, marginTop: 17, paddingTop: 13 },
  resourceTitle: { color: colors.muted, flex: 1, fontFamily: fonts.body, fontSize: 9, fontWeight: '800' },
  openLabel: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900' },
  openArrow: { color: colors.ink, fontSize: 13 },
  feedbackRow: { alignItems: 'center', borderTopColor: 'rgba(23,23,19,0.14)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14, paddingVertical: 8 },
  feedbackPrompt: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '700' },
  feedbackActions: { alignItems: 'center', flexDirection: 'row', gap: 1 },
  feedbackButton: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 7 },
  feedbackText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900' },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 25, marginTop: 28, padding: 30 },
  emptyMark: { color: colors.success, fontFamily: fonts.body, fontSize: 22, fontWeight: '900' },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  emptyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
