import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import {
  getCrossSaveSynthesis,
  getPersonalContext,
  listLearningItems,
  updateRecommendationFeedback,
  type ContextSnapshot,
  type CrossSaveSynthesis,
  type LearningItem,
} from '@/lib/curio-api';

type FeedbackAction = 'done' | 'later' | 'not_relevant';
type InsightTone = 'butter' | 'peach' | 'sage' | 'surface';

const DOMAIN_LABELS: Record<string, string> = {
  finance: 'Money',
  travel: 'Travel',
  food: 'Food',
  ai_work: 'AI + work',
  career: 'Career',
  health: 'Health',
  home: 'Home',
  relationships: 'Relationships',
  general: 'Ideas',
};

function openResource(id: string) {
  router.push({ pathname: '/resource/[id]', params: { id } });
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function InsightCard({
  label,
  title,
  body,
  note,
  resourceTitle,
  resourceId,
  tone,
}: {
  label: string;
  title: string;
  body: string;
  note?: string | null;
  resourceTitle: string;
  resourceId: string;
  tone: InsightTone;
}) {
  const toneStyle = tone === 'butter'
    ? styles.insightButter
    : tone === 'peach'
      ? styles.insightPeach
      : tone === 'sage'
        ? styles.insightSage
        : styles.insightSurface;
  return (
    <Pressable
      onPress={() => openResource(resourceId)}
      style={({ pressed }) => [styles.insightCard, toneStyle, shadows.card, pressed && styles.pressed]}>
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightBody}>{body}</Text>
      {note ? <Text style={styles.insightNote}>{note}</Text> : null}
      <View style={styles.insightFooter}>
        <Text numberOfLines={1} style={styles.insightResource}>{resourceTitle}</Text>
        <Text style={styles.cardArrow}>→</Text>
      </View>
    </Pressable>
  );
}

export default function PrioritiesScreen() {
  const [synthesis, setSynthesis] = useState<CrossSaveSynthesis | null>(null);
  const [items, setItems] = useState<LearningItem[]>([]);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      const [nextSynthesis, nextItems, nextContext] = await Promise.all([
        getCrossSaveSynthesis(),
        listLearningItems(),
        getPersonalContext(),
      ]);
      setSynthesis(nextSynthesis);
      setItems(nextItems.filter((item) => Boolean(item.card?.personalization)));
      setContext(nextContext);
      setError(null);
    } catch {
      setError('Curio could not connect your saves right now. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const hasSynthesis = Boolean(synthesis && (
    synthesis.themes.length
    || synthesis.interests.length
    || synthesis.remember
    || synthesis.changed
    || synthesis.repeated
    || synthesis.unresolved
  ));
  const fallbackItems = useMemo(() => items.slice(0, 3), [items]);
  const realConnection = context?.connections.find((connection) => !connection.isDemo) ?? null;

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

          <Text style={styles.eyebrow}>THE BIGGER PICTURE</Text>
          <Text style={styles.heading}>For you</Text>
          <Text style={styles.intro}>The patterns, changes, and loose ends across what you save.</Text>

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
              <Text style={styles.loadingText}>Connecting the dots…</Text>
            </View>
          ) : null}

          {synthesis ? (
            <View style={[styles.hero, shadows.card]}>
              <View style={styles.heroTopline}>
                <Text style={styles.heroLabel}>{synthesis.period.label.toLocaleUpperCase()}</Text>
                <Text style={styles.heroMark}>✦</Text>
              </View>
              <Text style={styles.heroTitle}>{synthesis.overview.headline}</Text>
              <Text style={styles.heroDetail}>{synthesis.overview.detail}</Text>
            </View>
          ) : null}

          {synthesis?.themes.length ? (
            <View>
              <SectionHeading title="Themes taking shape" subtitle="Ideas supported by more than one save." />
              {synthesis.themes.map((theme) => (
                <View key={theme.id} style={[styles.themeCard, shadows.card]}>
                  <View style={styles.themeTopline}>
                    <View style={styles.domainPill}><Text style={styles.domainPillText}>{DOMAIN_LABELS[theme.domain] ?? theme.domain}</Text></View>
                    <Text style={styles.themeCount}>{theme.sourceCount} {theme.sourceCount === 1 ? 'save' : 'saves'}</Text>
                  </View>
                  <Text style={styles.themeTitle}>{theme.title}</Text>
                  <Text style={styles.themeDescription}>{theme.description}</Text>
                  {theme.contextReason ? <Text style={styles.themeContext}>Relevant now · {theme.contextReason}</Text> : null}
                  <View style={styles.resourceList}>
                    {theme.resourceTitles.map((title, index) => (
                      <Pressable
                        key={theme.resourceIds[index]}
                        onPress={() => openResource(theme.resourceIds[index])}
                        style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]}>
                        <Text numberOfLines={2} style={styles.resourceRowTitle}>{title}</Text>
                        <Text style={styles.resourceArrow}>→</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {synthesis?.interests.length ? (
            <View>
              <SectionHeading title="What you explored" subtitle="Recent subjects grouped by area—not assumed to be connected." />
              {synthesis.interests.map((interest) => (
                <View key={interest.id} style={[styles.interestCard, shadows.card]}>
                  <View style={styles.themeTopline}>
                    <Text style={styles.interestEyebrow}>RECENT AREA</Text>
                    <Text style={styles.themeCount}>{interest.sourceCount} {interest.sourceCount === 1 ? 'save' : 'saves'}</Text>
                  </View>
                  <Text style={styles.interestTitle}>{interest.title}</Text>
                  <Text style={styles.interestDescription}>{interest.description}</Text>
                  <View style={styles.subjectList}>
                    {interest.subjects.map((subject) => (
                      <View key={subject} style={styles.subjectPill}>
                        <Text style={styles.subjectText}>{subject}</Text>
                      </View>
                    ))}
                    {interest.resourceCount > interest.subjects.length ? (
                      <View style={styles.subjectPill}><Text style={styles.subjectText}>+{interest.resourceCount - interest.subjects.length} more</Text></View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {synthesis?.remember ? (
            <View>
              <SectionHeading title="Keep close" subtitle="One useful point to remember." />
              <InsightCard
                body={synthesis.remember.point}
                label="WORTH REMEMBERING"
                note={synthesis.remember.reason}
                resourceId={synthesis.remember.resourceId}
                resourceTitle={synthesis.remember.title}
                title={synthesis.remember.heading ?? synthesis.remember.title}
                tone="butter"
              />
            </View>
          ) : null}

          {synthesis?.changed || synthesis?.repeated || synthesis?.unresolved ? (
            <View style={styles.insightsSection}>
              {synthesis.changed ? (
                <InsightCard
                  body={synthesis.changed.summary}
                  label={synthesis.changed.label.toLocaleUpperCase()}
                  resourceId={synthesis.changed.resourceId}
                  resourceTitle={synthesis.changed.title}
                  title={synthesis.changed.title}
                  tone="peach"
                />
              ) : null}
              {synthesis.repeated ? (
                <InsightCard
                  body={synthesis.repeated.point}
                  label="SEEN MORE THAN ONCE"
                  note={`${synthesis.repeated.supportCount} saves support this point.`}
                  resourceId={synthesis.repeated.resourceId}
                  resourceTitle={synthesis.repeated.title}
                  title={synthesis.repeated.heading ?? synthesis.repeated.title}
                  tone="sage"
                />
              ) : null}
              {synthesis.unresolved ? (
                <InsightCard
                  body={synthesis.unresolved.claim}
                  label="NEEDS A CLOSER LOOK"
                  note={synthesis.unresolved.reason}
                  resourceId={synthesis.unresolved.resourceId}
                  resourceTitle={synthesis.unresolved.title}
                  title={synthesis.unresolved.heading ?? synthesis.unresolved.title}
                  tone="surface"
                />
              ) : null}
            </View>
          ) : null}

          {!loading && !hasSynthesis && fallbackItems.length > 0 ? (
            <View>
              <SectionHeading title="Still useful" subtitle="A few saves worth returning to while patterns form." />
              {fallbackItems.map((item) => {
                const personalization = item.card?.personalization;
                if (!item.card || !personalization) return null;
                return (
                  <View key={item.id} style={[styles.fallbackCard, shadows.card]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                      style={({ pressed }) => [styles.fallbackBody, pressed && styles.pressed]}>
                      <Text style={styles.fallbackLabel}>{DOMAIN_LABELS[personalization.domain] ?? personalization.domain}</Text>
                      <Text style={styles.fallbackTitle}>{item.card.title}</Text>
                      <Text style={styles.fallbackWhy}>{personalization.whyNow}</Text>
                    </Pressable>
                    <View style={styles.feedbackRow}>
                      <Text style={styles.feedbackPrompt}>Useful?</Text>
                      {updatingId === item.id ? <ActivityIndicator color={colors.ink} size="small" /> : (
                        <View style={styles.feedbackActions}>
                          <Pressable onPress={() => void saveFeedback(item.id, 'done')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Done</Text></Pressable>
                          <Pressable onPress={() => void saveFeedback(item.id, 'later')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Later</Text></Pressable>
                          <Pressable onPress={() => void saveFeedback(item.id, 'not_relevant')} style={styles.feedbackButton}><Text style={styles.feedbackText}>Not for me</Text></Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {!loading && !hasSynthesis && fallbackItems.length === 0 ? (
            <View style={[styles.empty, shadows.card]}>
              <Text style={styles.emptyMark}>✦</Text>
              <Text style={styles.emptyTitle}>Patterns will appear here</Text>
              <Text style={styles.emptyCopy}>Save a few related ideas and Curio will connect them without any extra organizing.</Text>
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
  content: { paddingBottom: 40, paddingHorizontal: 18 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 27, paddingTop: 12 },
  settingsButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 8 },
  settingsButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  settingsArrow: { color: colors.ink, fontSize: 12 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 51, fontWeight: '700', letterSpacing: -2.2, lineHeight: 57, marginTop: 2 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 5, maxWidth: 340 },
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
  heroTitle: { color: colors.surface, fontFamily: fonts.display, fontSize: 31, fontWeight: '700', letterSpacing: -0.8, lineHeight: 35, marginTop: 30 },
  heroDetail: { color: '#C9C5B9', fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 12 },
  sectionHeader: { marginBottom: 13, marginTop: 32 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  sectionSubtitle: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  themeCard: { backgroundColor: colors.surface, borderRadius: 25, marginBottom: 14, padding: 19 },
  themeTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  domainPill: { backgroundColor: colors.lilac, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  domainPillText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  themeCount: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  themeTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, lineHeight: 30, marginTop: 15 },
  themeDescription: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  themeContext: { color: colors.success, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', lineHeight: 15, marginTop: 10 },
  resourceList: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16 },
  interestCard: { backgroundColor: '#E9E4D8', borderRadius: 25, marginBottom: 14, padding: 19 },
  interestEyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  interestTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, lineHeight: 30, marginTop: 15 },
  interestDescription: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  subjectList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 },
  subjectPill: { backgroundColor: colors.surface, borderColor: '#D6CEBE', borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 7 },
  subjectText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '800' },
  resourceRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 47, paddingVertical: 9 },
  resourceRowTitle: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', lineHeight: 15 },
  resourceArrow: { color: colors.ink, fontSize: 13 },
  insightsSection: { gap: 14, marginTop: 28 },
  insightCard: { borderRadius: 25, padding: 19 },
  insightButter: { backgroundColor: '#E9D99D' },
  insightPeach: { backgroundColor: '#F0C2A4' },
  insightSage: { backgroundColor: '#C8D8C1' },
  insightSurface: { backgroundColor: colors.surface, borderColor: '#E2C0B8', borderWidth: 1 },
  insightLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  insightTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', letterSpacing: -0.5, lineHeight: 29, marginTop: 12 },
  insightBody: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 9 },
  insightNote: { borderLeftColor: colors.ink, borderLeftWidth: 2, color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', lineHeight: 15, marginTop: 13, paddingLeft: 9 },
  insightFooter: { alignItems: 'center', borderTopColor: 'rgba(23, 23, 19, 0.15)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 17, paddingTop: 12 },
  insightResource: { color: colors.muted, flex: 1, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  cardArrow: { color: colors.ink, fontSize: 14 },
  fallbackCard: { backgroundColor: colors.surface, borderRadius: 23, marginBottom: 13, overflow: 'hidden' },
  fallbackBody: { padding: 18 },
  fallbackLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  fallbackTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 28, marginTop: 10 },
  fallbackWhy: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  feedbackRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 45, paddingHorizontal: 15, paddingVertical: 8 },
  feedbackPrompt: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  feedbackActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  feedbackButton: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 6 },
  feedbackText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, marginTop: 28, padding: 30 },
  emptyMark: { color: colors.ink, fontSize: 23 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', marginTop: 10 },
  emptyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
