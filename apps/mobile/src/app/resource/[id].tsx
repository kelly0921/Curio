import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import { getKnowledgeResource, type KnowledgeResource, type LearningItem } from '@/lib/curio-api';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function sectionTitle(resource: KnowledgeResource): string {
  const count = resource.entries.length;
  if (resource.resourceType === 'glossary') return `${count} term${count === 1 ? '' : 's'}`;
  if (resource.resourceType === 'playbook') return `${count} step${count === 1 ? '' : 's'}`;
  if (resource.resourceType === 'watchlist') return `${count} item${count === 1 ? '' : 's'} to watch`;
  return `${count} useful insight${count === 1 ? '' : 's'}`;
}

function sourceTitle(source: LearningItem): string {
  return source.card?.title || source.creator || `${label(source.platform)} source`;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function intentLabel(intent: NonNullable<KnowledgeResource['intent']>): string {
  if (intent === 'reference') return 'For reference';
  return `To ${intent}`;
}

export default function ResourceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [resource, setResource] = useState<KnowledgeResource | null>(null);
  const [sources, setSources] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setError('This living resource could not be found.');
      setLoading(false);
      return undefined;
    }
    void getKnowledgeResource(id).then((result) => {
      if (cancelled || !result) return;
      setResource(result.resource);
      setSources(result.sources);
      setError(null);
    }).catch(() => {
      if (!cancelled) setError('Curio could not open this living resource.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const latestContribution = useMemo(() => resource?.contributions.at(-1) ?? null, [resource]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Opening this resource…</Text></View>;
  }

  if (!resource || error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Resource unavailable</Text>
        <Text style={styles.errorCopy}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.darkButton}><Text style={styles.darkButtonText}>Go back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable accessibilityLabel="Back to library" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
            <CurioBrand compact />
            <View style={styles.topbarSpacer} />
          </View>

          <View style={styles.tagRow}>
            <View style={styles.typePill}><Text style={styles.typePillText}>{label(resource.resourceType)}</Text></View>
            <Text style={styles.domain}>{label(resource.domain)}</Text>
            {resource.intent && <><Text style={styles.tagDivider}>·</Text><Text style={styles.intent}>{intentLabel(resource.intent)}</Text></>}
          </View>
          <Text style={styles.title}>{resource.title}</Text>
          <Text style={styles.summary}>{resource.summary}</Text>
          <View style={styles.resourceMeta}>
            <Text style={styles.resourceMetaText}>{resource.sourceItemIds.length} source{resource.sourceItemIds.length === 1 ? '' : 's'}</Text>
            <Text style={styles.resourceMetaDot}>·</Text>
            <Text style={styles.resourceMetaText}>Updated {dateLabel(resource.updatedAt)}</Text>
          </View>

          {latestContribution && (
            <View style={[styles.changeReceipt, latestContribution.disposition === 'conflict' && styles.changeReceiptConflict]}>
              <View style={[styles.changeMark, latestContribution.disposition === 'conflict' && styles.changeMarkConflict]}><Text style={styles.changeMarkText}>{latestContribution.disposition === 'conflict' ? '!' : '✦'}</Text></View>
              <View style={styles.changeCopy}>
                <Text style={styles.changeLabel}>LATEST CHANGE</Text>
                <Text style={styles.changeText}>{latestContribution.summary}</Text>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>CONSOLIDATED KNOWLEDGE</Text>
            <Text style={styles.sectionTitle}>{sectionTitle(resource)}</Text>
          </View>

          {resource.entries.map((entry, index) => {
            const materialResearch = entry.research && entry.research.verdict !== 'confirmed' && entry.research.verdict !== 'opinion';
            return (
              <View key={entry.id} style={[styles.entryCard, shadows.card]}>
                <View style={styles.entryHeader}>
                  <View style={styles.entryNumber}><Text style={styles.entryNumberText}>{index + 1}</Text></View>
                  <View style={styles.entryCopy}>
                    {(entry.status === 'contested' || entry.status === 'superseded') && (
                      <View style={[styles.entryStatus, entry.status === 'contested' ? styles.entryStatusConflict : styles.entryStatusEarlier]}>
                        <Text style={styles.entryStatusText}>{entry.status === 'contested' ? 'SOURCES DISAGREE' : 'EARLIER VERSION'}</Text>
                      </View>
                    )}
                    {entry.heading && <Text style={styles.entryHeading}>{entry.heading}</Text>}
                    <Text style={[styles.entryDetail, !entry.heading && styles.entryDetailStrong]}>{entry.detail}</Text>
                  </View>
                </View>
                {materialResearch && entry.research && (
                  <View style={[styles.researchNote, entry.research.verdict === 'corrected' && styles.researchCorrection]}>
                    <Text style={styles.researchLabel}>{entry.research.verdict === 'corrected' ? 'CORRECTED BY CURIO' : entry.research.verdict === 'not_verified' ? 'NOT YET VERIFIED' : 'CURIO ADDED'}</Text>
                    <Text style={styles.researchText}>{entry.research.correction || entry.research.explanation}</Text>
                  </View>
                )}
                <Text style={styles.entrySources}>{entry.sourceItemIds.length} supporting source{entry.sourceItemIds.length === 1 ? '' : 's'}</Text>
              </View>
            );
          })}

          {resource.lastResearchedAt && (
            <Text style={styles.researchedAt}>Research last checked {dateLabel(resource.lastResearchedAt)}</Text>
          )}

          <View style={styles.sourcesSection}>
            <Pressable onPress={() => setShowSources((current) => !current)} style={styles.sourcesToggle}>
              <View>
                <Text style={styles.sectionEyebrow}>PROVENANCE</Text>
                <Text style={styles.sourcesTitle}>{resource.sourceItemIds.length} original source{resource.sourceItemIds.length === 1 ? '' : 's'}</Text>
              </View>
              <Text style={styles.sourcesToggleIcon}>{showSources ? '−' : '+'}</Text>
            </Pressable>
            {showSources && sources.map((source) => (
              <Pressable
                key={source.id}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: source.id } })}
                style={styles.sourceRow}>
                <View style={styles.sourceMark}><Text style={styles.sourceMarkText}>{source.platform === 'instagram' ? '◎' : '↗'}</Text></View>
                <View style={styles.sourceCopy}>
                  <Text numberOfLines={2} style={styles.sourceTitle}>{sourceTitle(source)}</Text>
                  <Text style={styles.sourceMeta}>{label(source.platform)}{source.creator ? ` · ${source.creator}` : ''}</Text>
                </View>
                <Text style={styles.sourceArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 50, paddingHorizontal: 18 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 34, paddingTop: 12 },
  backButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 17, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  backText: { color: colors.ink, fontSize: 19 },
  topbarSpacer: { width: 36 },
  tagRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  typePill: { backgroundColor: colors.lilac, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  typePillText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  domain: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  tagDivider: { color: colors.muted, fontSize: 10 },
  intent: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 42, fontWeight: '700', letterSpacing: -1.7, lineHeight: 46, marginTop: 17 },
  summary: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 13 },
  resourceMeta: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 15 },
  resourceMetaText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  resourceMetaDot: { color: colors.muted, fontSize: 10 },
  changeReceipt: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, flexDirection: 'row', marginTop: 25, padding: 14 },
  changeReceiptConflict: { borderColor: colors.peach, borderWidth: 1 },
  changeMark: { alignItems: 'center', backgroundColor: colors.butter, borderRadius: 14, height: 38, justifyContent: 'center', width: 38 },
  changeMarkConflict: { backgroundColor: colors.peach },
  changeMarkText: { color: colors.ink, fontSize: 16 },
  changeCopy: { flex: 1, marginLeft: 11 },
  changeLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  changeText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  sectionHeader: { paddingBottom: 15, paddingTop: 38 },
  sectionEyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -0.7, marginTop: 4 },
  entryCard: { backgroundColor: colors.surface, borderRadius: 23, marginBottom: 13, padding: 18 },
  entryHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  entryNumber: { alignItems: 'center', backgroundColor: colors.canvas, borderRadius: 13, height: 30, justifyContent: 'center', width: 30 },
  entryNumberText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '900' },
  entryCopy: { flex: 1 },
  entryStatus: { alignSelf: 'flex-start', borderRadius: 8, marginBottom: 7, paddingHorizontal: 7, paddingVertical: 4 },
  entryStatusConflict: { backgroundColor: colors.peach },
  entryStatusEarlier: { backgroundColor: colors.line },
  entryStatusText: { color: colors.ink, fontFamily: fonts.body, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  entryHeading: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: '700', lineHeight: 25 },
  entryDetail: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 5 },
  entryDetailStrong: { color: colors.ink, fontWeight: '700', marginTop: 4 },
  researchNote: { backgroundColor: colors.canvas, borderRadius: 14, marginTop: 14, padding: 12 },
  researchCorrection: { backgroundColor: colors.peach },
  researchLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  researchText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 5 },
  entrySources: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', marginTop: 13 },
  researchedAt: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, marginTop: 3, textAlign: 'right' },
  sourcesSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 40, paddingTop: 24 },
  sourcesToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 13 },
  sourcesTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: '700', marginTop: 4 },
  sourcesToggleIcon: { color: colors.ink, fontSize: 20 },
  sourceRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 17, flexDirection: 'row', marginTop: 9, padding: 12 },
  sourceMark: { alignItems: 'center', backgroundColor: colors.sage, borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  sourceMarkText: { color: colors.ink, fontSize: 17 },
  sourceCopy: { flex: 1, marginLeft: 11 },
  sourceTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', lineHeight: 15 },
  sourceMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, marginTop: 3 },
  sourceArrow: { color: colors.ink, fontSize: 13 },
  center: { alignItems: 'center', backgroundColor: colors.canvas, flex: 1, justifyContent: 'center', padding: 24 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 10 },
  errorTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700' },
  errorCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  darkButton: { backgroundColor: colors.dark, borderRadius: 15, marginTop: 18, paddingHorizontal: 18, paddingVertical: 12 },
  darkButtonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
});
