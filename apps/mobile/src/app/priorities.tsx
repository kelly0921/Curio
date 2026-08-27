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
  updateResourceFollowThrough,
  updateForYouFeedback,
  type ContextSnapshot,
  type CrossSaveSynthesis,
  type ForYouFeedback,
  type ForYouLane,
  type ForYouRecommendation,
  type FollowThroughPlan,
  type FollowThroughUpdate,
} from '@/lib/curio-api';
import { followThroughAttentionPresentation, followThroughPresentation } from '@/lib/resource-presentation';

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

function shortReviewDate(value: string | null): string {
  if (!value) return 'When something changes';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'When something changes';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function planTimingTone(attention: FollowThroughPlan['attention']) {
  if (attention === 'now') return styles.planTimingNow;
  if (attention === 'soon') return styles.planTimingSoon;
  return styles.planTimingOnTrack;
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

function ActivePlanCard({
  plan,
  updatingKey,
  onUpdate,
}: {
  plan: FollowThroughPlan;
  updatingKey: string | null;
  onUpdate: (update: FollowThroughUpdate) => void;
}) {
  const copy = followThroughPresentation(plan.kind);
  const timing = followThroughAttentionPresentation(plan.attention);
  const visibleEntries = plan.entries.slice(0, 4);
  return (
    <View style={[styles.planCard, shadows.card]}>
      <View style={styles.planTopline}>
        <Text style={styles.planEyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.planProgress}>{plan.completedCount}/{plan.totalCount} {copy.progressNoun}</Text>
      </View>
      <Text style={styles.planTitle}>{plan.resourceTitle}</Text>
      <View style={[styles.planTiming, planTimingTone(plan.attention)]}>
        <Text style={styles.planTimingLabel}>{timing.label}</Text>
        <Text numberOfLines={2} style={styles.planTimingText}>
          {timing.showReason ? plan.whyNow : shortReviewDate(plan.nextReviewAt)}
        </Text>
      </View>
      <View style={styles.planEntries}>
        {visibleEntries.map((entry) => {
          const key = `${plan.resourceId}:${entry.id}`;
          return (
            <Pressable
              accessibilityLabel={`${entry.completed ? 'Mark not done' : 'Mark done'}: ${entry.title}`}
              disabled={Boolean(updatingKey)}
              key={entry.id}
              onPress={() => onUpdate({ action: 'toggle_entry', entryId: entry.id, completed: !entry.completed })}
              style={styles.planEntry}>
              <View style={[styles.planCheck, entry.completed && styles.planCheckDone]}>
                {updatingKey === key
                  ? <ActivityIndicator color={colors.ink} size="small" />
                  : entry.completed && <Text style={styles.planCheckmark}>✓</Text>}
              </View>
              <Text numberOfLines={2} style={[styles.planEntryText, entry.completed && styles.planEntryTextDone]}>{entry.title}</Text>
            </Pressable>
          );
        })}
      </View>
      {plan.entries.length > visibleEntries.length && (
        <Text style={styles.planMore}>+{plan.entries.length - visibleEntries.length} more inside the resource</Text>
      )}
      <View style={styles.planActions}>
        <Pressable onPress={() => openResource(plan.resourceId)} style={styles.planOpenButton}>
          <Text style={styles.planOpenText}>Open resource</Text>
          <Text style={styles.planOpenArrow}>→</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`${copy.completeLabel}: ${plan.resourceTitle}`}
          disabled={Boolean(updatingKey)}
          onPress={() => onUpdate({ action: 'complete' })}
          style={styles.planDoneButton}>
          {updatingKey === `${plan.resourceId}:complete`
            ? <ActivityIndicator color={colors.surface} size="small" />
            : <Text style={styles.planDoneText}>Done</Text>}
        </Pressable>
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
  const [followThroughUpdatingKey, setFollowThroughUpdatingKey] = useState<string | null>(null);
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
  const activePlans = synthesis?.followThrough ?? [];
  const timelyPlanCount = activePlans.filter((plan) => plan.attention !== 'on_track').length;
  const attentionCount = timelyPlanCount + recommendations.length;

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

  async function saveFollowThrough(plan: FollowThroughPlan, update: FollowThroughUpdate) {
    if (followThroughUpdatingKey) return;
    const key = update.action === 'toggle_entry'
      ? `${plan.resourceId}:${update.entryId}`
      : `${plan.resourceId}:${update.action}`;
    setFollowThroughUpdatingKey(key);
    setError(null);
    try {
      const updated = await updateResourceFollowThrough(plan.resourceId, update);
      setSynthesis((current) => current ? {
        ...current,
        followThrough: updated.state === 'active'
          ? current.followThrough.map((candidate) => candidate.resourceId === updated.resourceId ? updated : candidate)
          : current.followThrough.filter((candidate) => candidate.resourceId !== updated.resourceId),
      } : current);
    } catch {
      setError('Curio could not update that plan. Try again.');
    } finally {
      setFollowThroughUpdatingKey(null);
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
              <Text style={styles.heroTitle}>{attentionCount
                ? `${attentionCount} thing${attentionCount === 1 ? '' : 's'} worth your attention`
                : 'You are caught up for now'}</Text>
              <Text style={styles.heroDetail}>{activePlans.length
                ? timelyPlanCount
                  ? 'What changed or became due is first. Curio keeps the rest quietly on track.'
                  : recommendations.length
                    ? 'Your plans are on track. The count above is only the timely suggestions Curio found.'
                    : 'Your plans are on track. Curio will move one up when something changes or needs attention.'
                : recommendations.length === 3
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

          {activePlans.length ? (
            <View style={styles.plansSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>You chose</Text>
                <Text style={styles.sectionSubtitle}>Sorted by what changed and what is due. Quieter plans keep their next check date.</Text>
              </View>
              {activePlans.map((plan) => (
                <ActivePlanCard
                  key={plan.resourceId}
                  onUpdate={(update) => void saveFollowThrough(plan, update)}
                  plan={plan}
                  updatingKey={followThroughUpdatingKey}
                />
              ))}
            </View>
          ) : null}

          {recommendations.length ? (
            <View style={styles.recommendationsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{activePlans.length ? 'Curio suggests' : 'Your next three'}</Text>
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

          {!loading && synthesis && activePlans.length === 0 && attentionCount === 0 ? (
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
  plansSection: { marginTop: 34 },
  sectionHeader: { marginBottom: 15 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 29, fontWeight: '700', letterSpacing: -0.7 },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  planCard: { backgroundColor: colors.surface, borderRadius: 26, marginBottom: 16, padding: 19 },
  planTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  planEyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  planProgress: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '800' },
  planTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, lineHeight: 31, marginTop: 12 },
  planTiming: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', gap: 9, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  planTimingNow: { backgroundColor: '#F3DFD4' },
  planTimingSoon: { backgroundColor: '#F1E7BE' },
  planTimingOnTrack: { backgroundColor: '#ECE8DE' },
  planTimingLabel: { color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  planTimingText: { color: colors.muted, flex: 1, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', lineHeight: 13 },
  planEntries: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginTop: 15, paddingTop: 10 },
  planEntry: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 43, paddingVertical: 5 },
  planCheck: { alignItems: 'center', borderColor: colors.muted, borderRadius: 10, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  planCheckDone: { backgroundColor: colors.sage, borderColor: colors.sage },
  planCheckmark: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '900' },
  planEntryText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  planEntryTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  planMore: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, marginTop: 7 },
  planActions: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, marginTop: 15, paddingTop: 14 },
  planOpenButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7, minHeight: 42 },
  planOpenText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '900' },
  planOpenArrow: { color: colors.ink, fontSize: 13 },
  planDoneButton: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 14, justifyContent: 'center', minHeight: 42, minWidth: 72, paddingHorizontal: 14 },
  planDoneText: { color: colors.surface, fontFamily: fonts.body, fontSize: 10, fontWeight: '900' },
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
