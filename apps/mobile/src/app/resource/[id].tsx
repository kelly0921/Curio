import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import {
  CurioApiError,
  deepenKnowledgeResourceEntry,
  getKnowledgeResource,
  recordResourceEngagement,
  refreshKnowledgeResource,
  type KnowledgeResource,
  type KnowledgeResourceEntry,
  type LearningItem,
  type ResourceDeepDiveKind,
  type ResourceFreshness,
  type ResourceResearchReceipt,
} from '@/lib/curio-api';
import { researchVerdictLabel } from '@/lib/learning-presentation';
import { displayResearchSources, researchDepthLabel, resourceDeepDiveOptions, resourceUseGuide } from '@/lib/resource-presentation';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function sectionTitle(resource: KnowledgeResource): string {
  const count = resource.entries.length;
  if (resource.intent === 'try') return `${count} step${count === 1 ? '' : 's'} to try`;
  if (resource.intent === 'visit') return `${count} tip${count === 1 ? '' : 's'} to plan with`;
  if (resource.intent === 'buy') return `${count} thing${count === 1 ? '' : 's'} to consider`;
  if (resource.intent === 'track') return `${count} item${count === 1 ? '' : 's'} to watch`;
  if (resource.intent === 'compare') return `${count} decision point${count === 1 ? '' : 's'}`;
  if (resource.intent === 'reference') return `${count} useful note${count === 1 ? '' : 's'}`;
  if (resource.resourceType === 'glossary') return `${count} term${count === 1 ? '' : 's'}`;
  if (resource.resourceType === 'playbook') return `${count} step${count === 1 ? '' : 's'}`;
  if (resource.resourceType === 'watchlist') return `${count} item${count === 1 ? '' : 's'} to watch`;
  return `${count} useful insight${count === 1 ? '' : 's'}`;
}

function sectionEyebrow(resource: KnowledgeResource): string {
  if (resource.intent === 'try') return 'PRACTICAL STEPS';
  if (resource.intent === 'visit') return 'PLAN WITH THIS';
  if (resource.intent === 'buy') return 'BEFORE YOU BUY';
  if (resource.intent === 'track') return 'WATCH OVER TIME';
  if (resource.intent === 'compare') return 'WEIGH THE OPTIONS';
  if (resource.intent === 'reference') return 'QUICK REFERENCE';
  return resource.resourceType === 'glossary' ? 'IN PLAIN ENGLISH' : 'WHAT TO KNOW';
}

function sourceTitle(source: LearningItem): string {
  return source.card?.title || source.creator || `${label(source.platform)} source`;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function intentLabel(intent: NonNullable<KnowledgeResource['intent']>): string {
  if (intent === 'try') return 'Ready to try';
  if (intent === 'visit') return 'Plan with this';
  if (intent === 'buy') return 'Before buying';
  if (intent === 'track') return 'Worth watching';
  if (intent === 'compare') return 'Compare options';
  if (intent === 'reference') return 'Keep for reference';
  return 'Understand';
}

function refreshTitle(resource: KnowledgeResource, status: ResourceFreshness['status']): string {
  if (resource.intent === 'track') return 'Check what changed';
  if (resource.intent === 'buy' || resource.intent === 'compare') return 'Recheck before deciding';
  if (resource.intent === 'visit') return 'Recheck before the trip';
  return status === 'unresearched' ? 'Check the important claims' : 'Bring this resource up to date';
}

export default function ResourceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [resource, setResource] = useState<KnowledgeResource | null>(null);
  const [sources, setSources] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(() => new Set());
  const [activeDeepDiveKinds, setActiveDeepDiveKinds] = useState<Record<string, ResourceDeepDiveKind | undefined>>({});
  const [deepDiveLoadingKey, setDeepDiveLoadingKey] = useState<string | null>(null);
  const [deepDiveErrors, setDeepDiveErrors] = useState<Record<string, string | undefined>>({});
  const [freshness, setFreshness] = useState<ResourceFreshness | null>(null);
  const [refreshReceipt, setRefreshReceipt] = useState<ResourceResearchReceipt | null>(null);
  const [refreshingResearch, setRefreshingResearch] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
      setFreshness(result.freshness);
      setError(null);
      void recordResourceEngagement(id, 'opened').catch(() => undefined);
    }).catch(() => {
      if (!cancelled) setError('Curio could not open this living resource.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const latestContribution = useMemo(() => resource?.contributions.at(-1) ?? null, [resource]);
  const researchNeedsRefresh = freshness?.status === 'due' || freshness?.status === 'unresearched';
  const useGuide = useMemo(() => resource ? resourceUseGuide(resource) : null, [resource]);
  const deepDiveOptions = useMemo(() => resource ? resourceDeepDiveOptions(resource) : [], [resource]);
  const suggestedNextMove = useMemo(() => [...sources]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((source) => source.card?.suggestedAction)?.card?.suggestedAction ?? null, [sources]);

  function toggleEntryDepth(entryId: string) {
    const opening = !expandedEntryIds.has(entryId);
    if (opening && id) void recordResourceEngagement(id, 'expanded').catch(() => undefined);
    setExpandedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function openResearchSource(url: string) {
    if (id) void recordResourceEngagement(id, 'source_opened').catch(() => undefined);
    void WebBrowser.openBrowserAsync(url);
  }

  async function handleDeepDive(entry: KnowledgeResourceEntry, kind: ResourceDeepDiveKind) {
    setActiveDeepDiveKinds((current) => ({ ...current, [entry.id]: kind }));
    if (id) void recordResourceEngagement(id, 'deep_dive').catch(() => undefined);
    if (entry.deepDives?.some((deepDive) => deepDive.kind === kind) || !id || deepDiveLoadingKey) return;
    const loadingKey = `${entry.id}:${kind}`;
    setDeepDiveLoadingKey(loadingKey);
    setDeepDiveErrors((current) => ({ ...current, [entry.id]: undefined }));
    try {
      const result = await deepenKnowledgeResourceEntry(id, entry.id, kind);
      setResource(result.resource);
    } catch (deepDiveFailure) {
      setDeepDiveErrors((current) => ({
        ...current,
        [entry.id]: deepDiveFailure instanceof CurioApiError
          ? deepDiveFailure.message
          : 'Curio could not research this question right now.',
      }));
    } finally {
      setDeepDiveLoadingKey(null);
    }
  }

  async function handleResearchRefresh() {
    if (!id || refreshingResearch) return;
    setRefreshingResearch(true);
    setRefreshError(null);
    try {
      const result = await refreshKnowledgeResource(id);
      setResource(result.resource);
      setFreshness(result.freshness);
      setRefreshReceipt(result.receipt);
    } catch (refreshFailure) {
      setRefreshError(refreshFailure instanceof CurioApiError
        ? refreshFailure.message
        : 'Curio could not refresh this research right now.');
    } finally {
      setRefreshingResearch(false);
    }
  }

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

          {freshness?.status === 'current' && freshness.checkedAt && (
            <View style={styles.freshnessCurrent}>
              <View style={styles.freshnessDot} />
              <Text style={styles.freshnessCurrentText}>Research checked {dateLabel(freshness.checkedAt)} · Current</Text>
            </View>
          )}

          {researchNeedsRefresh && freshness && (
            <View style={styles.freshnessCallout}>
              <View style={styles.freshnessCalloutCopy}>
                <Text style={styles.freshnessEyebrow}>{freshness.status === 'unresearched' ? 'RESEARCH NEEDED' : 'RESEARCH DUE'}</Text>
                <Text style={styles.freshnessTitle}>{refreshTitle(resource, freshness.status)}</Text>
                <Text style={styles.freshnessReason}>{freshness.reason}</Text>
              </View>
              <Pressable
                accessibilityLabel="Refresh this resource's research"
                disabled={refreshingResearch}
                onPress={() => void handleResearchRefresh()}
                style={[styles.refreshButton, refreshingResearch && styles.refreshButtonDisabled]}>
                {refreshingResearch
                  ? <ActivityIndicator color={colors.surface} size="small" />
                  : <Text style={styles.refreshButtonText}>Refresh</Text>}
              </Pressable>
            </View>
          )}
          {refreshError && <Text style={styles.refreshError}>{refreshError}</Text>}

          {(latestContribution || refreshReceipt) && (
            <View style={[styles.changeReceipt, !refreshReceipt && latestContribution?.disposition === 'conflict' && styles.changeReceiptConflict]}>
              <View style={[styles.changeMark, !refreshReceipt && latestContribution?.disposition === 'conflict' && styles.changeMarkConflict]}><Text style={styles.changeMarkText}>{!refreshReceipt && latestContribution?.disposition === 'conflict' ? '!' : '✦'}</Text></View>
              <View style={styles.changeCopy}>
                <Text style={styles.changeLabel}>{refreshReceipt ? 'RESEARCH REFRESH' : 'LATEST CHANGE'}</Text>
                <Text style={styles.changeText}>{refreshReceipt?.summary ?? latestContribution?.summary}</Text>
              </View>
            </View>
          )}

          {useGuide && (
            <View style={styles.usePanel}>
              <Text style={styles.useEyebrow}>PUT THIS TO USE</Text>
              <Text style={styles.useTitle}>{useGuide.title}</Text>
              <Text style={styles.useDescription}>{useGuide.description}</Text>
              {suggestedNextMove && (
                <View style={styles.nextMove}>
                  <Text style={styles.nextMoveLabel}>A USEFUL NEXT MOVE</Text>
                  <Text style={styles.nextMoveText}>{suggestedNextMove}</Text>
                </View>
              )}
              <View style={styles.useFocus}>
                <Text style={styles.useFocusLabel}>{useGuide.focusLabel}</Text>
                <Text style={styles.useFocusText}>{useGuide.focus}</Text>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>{sectionEyebrow(resource)}</Text>
            <Text style={styles.sectionTitle}>{sectionTitle(resource)}</Text>
          </View>

          {resource.entries.map((entry, index) => {
            const research = entry.research;
            const researchSources = research ? displayResearchSources(research.sources) : [];
            const depthExpanded = expandedEntryIds.has(entry.id);
            const importantCorrection = research?.correction
              && research.verdict !== 'confirmed'
              && research.verdict !== 'opinion';
            const activeDeepDiveKind = activeDeepDiveKinds[entry.id];
            const activeDeepDive = entry.deepDives?.find((deepDive) => deepDive.kind === activeDeepDiveKind) ?? null;
            const activeDeepDiveSources = activeDeepDive ? displayResearchSources(activeDeepDive.sources) : [];
            const entryDeepDiveLoading = deepDiveLoadingKey?.startsWith(`${entry.id}:`) ?? false;
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
                {importantCorrection && research && (
                  <View style={[styles.researchNote, research.verdict === 'corrected' && styles.researchCorrection]}>
                    <Text style={styles.researchLabel}>{research.verdict === 'corrected' ? 'CORRECTED BY CURIO' : research.verdict === 'not_verified' ? 'NOT YET VERIFIED' : 'IMPORTANT CONTEXT'}</Text>
                    <Text style={styles.researchText}>{research.correction}</Text>
                  </View>
                )}
                {research && (
                  <View style={styles.depthSection}>
                    <Pressable
                      accessibilityLabel={`${depthExpanded ? 'Hide' : 'Learn more about'} ${entry.heading || `point ${index + 1}`}`}
                      accessibilityState={{ expanded: depthExpanded }}
                      onPress={() => toggleEntryDepth(entry.id)}
                      style={styles.depthToggle}>
                      <View style={styles.depthToggleCopy}>
                        <Text style={styles.depthLabel}>{researchDepthLabel(research.verdict).toUpperCase()}</Text>
                        <Text style={styles.depthMeta}>{researchVerdictLabel(research.verdict)}{researchSources.length ? ` · ${researchSources.length} source${researchSources.length === 1 ? '' : 's'}` : ''}</Text>
                      </View>
                      <Text style={styles.depthToggleText}>{depthExpanded ? 'Hide  −' : 'Learn more  +'}</Text>
                    </Pressable>
                    {depthExpanded && (
                      <View style={styles.depthContent}>
                        <Text style={styles.depthContentLabel}>{research.verdict === 'not_verified' ? 'WHAT IS STILL UNCERTAIN' : research.verdict === 'opinion' ? 'HOW TO READ THIS' : 'WHAT CURIO FOUND'}</Text>
                        <Text style={styles.depthExplanation}>{research.explanation}</Text>
                        {research.correction && !importantCorrection && (
                          <View style={styles.depthBottomLine}>
                            <Text style={styles.depthBottomLineLabel}>BOTTOM LINE</Text>
                            <Text style={styles.depthBottomLineText}>{research.correction}</Text>
                          </View>
                        )}
                        {researchSources.length > 0 && (
                          <View style={styles.researchSources}>
                            <Text style={styles.researchSourcesLabel}>READ THE SOURCES</Text>
                            {researchSources.map((source) => (
                              <Pressable key={source.url} onPress={() => openResearchSource(source.url)} style={styles.researchSourceRow}>
                                <View style={styles.researchSourceCopy}>
                                  <Text numberOfLines={2} style={styles.researchSourceTitle}>{source.displayTitle}</Text>
                                  <Text style={styles.researchSourcePublisher}>{source.publisher}</Text>
                                </View>
                                <Text style={styles.researchSourceArrow}>↗</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                        <View style={styles.deepDiveSection}>
                          <Text style={styles.deepDiveEyebrow}>GO DEEPER</Text>
                          <Text style={styles.deepDiveIntro}>Choose one. Curio will research it once and keep the answer with this resource.</Text>
                          <View style={styles.deepDiveOptions}>
                            {deepDiveOptions.map((option) => {
                              const saved = entry.deepDives?.some((deepDive) => deepDive.kind === option.kind) ?? false;
                              const active = activeDeepDiveKind === option.kind;
                              const loading = deepDiveLoadingKey === `${entry.id}:${option.kind}`;
                              return (
                                <Pressable
                                  key={option.kind}
                                  accessibilityLabel={`${option.label}${saved ? ', saved' : ''}`}
                                  disabled={entryDeepDiveLoading}
                                  onPress={() => void handleDeepDive(entry, option.kind)}
                                  style={[styles.deepDiveOption, active && styles.deepDiveOptionActive, saved && styles.deepDiveOptionSaved]}>
                                  {loading
                                    ? <ActivityIndicator color={colors.ink} size="small" />
                                    : <Text style={[styles.deepDiveOptionText, active && styles.deepDiveOptionTextActive]}>{saved ? '✓ ' : ''}{option.label}</Text>}
                                </Pressable>
                              );
                            })}
                          </View>
                          {entryDeepDiveLoading && <Text style={styles.deepDiveLoading}>Researching current, authoritative sources…</Text>}
                          {deepDiveErrors[entry.id] && <Text style={styles.deepDiveError}>{deepDiveErrors[entry.id]}</Text>}
                          {activeDeepDive && (
                            <View style={styles.deepDiveAnswer}>
                              <Text style={styles.deepDiveQuestion}>{activeDeepDive.question}</Text>
                              <Text style={styles.deepDiveAnswerText}>{activeDeepDive.answer}</Text>
                              {activeDeepDiveSources.length > 0 && (
                                <View style={styles.deepDiveSources}>
                                  <Text style={styles.researchSourcesLabel}>SOURCES</Text>
                                  {activeDeepDiveSources.map((source) => (
                                    <Pressable key={source.url} onPress={() => openResearchSource(source.url)} style={styles.researchSourceRow}>
                                      <View style={styles.researchSourceCopy}>
                                        <Text numberOfLines={2} style={styles.researchSourceTitle}>{source.displayTitle}</Text>
                                        <Text style={styles.researchSourcePublisher}>{source.publisher}</Text>
                                      </View>
                                      <Text style={styles.researchSourceArrow}>↗</Text>
                                    </Pressable>
                                  ))}
                                </View>
                              )}
                              <Text style={styles.deepDiveDate}>Researched {dateLabel(activeDeepDive.researchedAt)}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.entrySources}>{entry.sourceItemIds.length} supporting source{entry.sourceItemIds.length === 1 ? '' : 's'}</Text>
              </View>
            );
          })}

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
                onPress={() => {
                  if (id) void recordResourceEngagement(id, 'source_opened').catch(() => undefined);
                  router.push({ pathname: '/item/[id]', params: { id: source.id } });
                }}
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
  freshnessCurrent: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 13 },
  freshnessDot: { backgroundColor: colors.success, borderRadius: 4, height: 7, width: 7 },
  freshnessCurrentText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  freshnessCallout: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 22, flexDirection: 'row', gap: 14, marginTop: 22, padding: 16 },
  freshnessCalloutCopy: { flex: 1 },
  freshnessEyebrow: { color: colors.butter, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  freshnessTitle: { color: colors.surface, fontFamily: fonts.display, fontSize: 19, fontWeight: '700', lineHeight: 22, marginTop: 4 },
  freshnessReason: { color: '#C9C6BC', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 5 },
  refreshButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 15, justifyContent: 'center', minHeight: 42, minWidth: 76, paddingHorizontal: 13 },
  refreshButtonDisabled: { opacity: 0.7 },
  refreshButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '900' },
  refreshError: { color: '#9A4E3E', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 9 },
  changeReceipt: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 20, flexDirection: 'row', marginTop: 25, padding: 14 },
  changeReceiptConflict: { borderColor: colors.peach, borderWidth: 1 },
  changeMark: { alignItems: 'center', backgroundColor: colors.butter, borderRadius: 14, height: 38, justifyContent: 'center', width: 38 },
  changeMarkConflict: { backgroundColor: colors.peach },
  changeMarkText: { color: colors.ink, fontSize: 16 },
  changeCopy: { flex: 1, marginLeft: 11 },
  changeLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  changeText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  usePanel: { backgroundColor: colors.sage, borderRadius: 26, marginTop: 28, padding: 20 },
  useEyebrow: { color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  useTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.7, lineHeight: 31, marginTop: 7 },
  useDescription: { color: '#384437', fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 9 },
  nextMove: { backgroundColor: 'rgba(255,252,246,0.72)', borderRadius: 17, marginTop: 18, padding: 14 },
  nextMoveLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  nextMoveText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 5 },
  useFocus: { borderTopColor: 'rgba(23,23,19,0.16)', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 17, paddingTop: 14 },
  useFocusLabel: { color: '#4D594B', fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  useFocusText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', lineHeight: 16, marginTop: 5 },
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
  depthSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 4 },
  depthToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingVertical: 8 },
  depthToggleCopy: { flex: 1, paddingRight: 10 },
  depthLabel: { color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  depthMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, marginTop: 3 },
  depthToggleText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '900' },
  depthContent: { backgroundColor: colors.canvas, borderRadius: 17, marginBottom: 5, padding: 15 },
  depthContentLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  depthExplanation: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 19, marginTop: 7 },
  depthBottomLine: { borderLeftColor: colors.peach, borderLeftWidth: 3, marginTop: 15, paddingLeft: 11 },
  depthBottomLineLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  depthBottomLineText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', lineHeight: 17, marginTop: 4 },
  researchSources: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 17, paddingTop: 14 },
  researchSourcesLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  researchSourceRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 13, flexDirection: 'row', marginTop: 8, padding: 11 },
  researchSourceCopy: { flex: 1, paddingRight: 9 },
  researchSourceTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800', lineHeight: 14 },
  researchSourcePublisher: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, marginTop: 3 },
  researchSourceArrow: { color: colors.ink, fontSize: 13 },
  deepDiveSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 18, paddingTop: 16 },
  deepDiveEyebrow: { color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  deepDiveIntro: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 5 },
  deepDiveOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  deepDiveOption: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 13, borderWidth: 1, flexGrow: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 11, paddingVertical: 8 },
  deepDiveOptionActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  deepDiveOptionSaved: { borderColor: colors.success },
  deepDiveOptionText: { color: colors.ink, fontFamily: fonts.body, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  deepDiveOptionTextActive: { color: colors.surface },
  deepDiveLoading: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontStyle: 'italic', marginTop: 10 },
  deepDiveError: { color: colors.danger, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 10 },
  deepDiveAnswer: { backgroundColor: colors.sky, borderRadius: 17, marginTop: 13, padding: 15 },
  deepDiveQuestion: { color: colors.ink, fontFamily: fonts.display, fontSize: 19, fontWeight: '700', lineHeight: 23 },
  deepDiveAnswerText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, lineHeight: 18, marginTop: 9 },
  deepDiveSources: { borderTopColor: 'rgba(23,23,19,0.14)', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 13 },
  deepDiveDate: { color: '#526474', fontFamily: fonts.body, fontSize: 8, fontWeight: '700', marginTop: 11 },
  entrySources: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '700', marginTop: 13 },
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
