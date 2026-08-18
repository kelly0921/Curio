import { Link, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts, shadows } from '@/constants/curio-theme';
import { getLearningItem, saveLink, type LearningItem } from '@/lib/curio-api';
import {
  learningFormatLabel,
  learningSectionTitle,
  learningUnits,
  researchDisclosureLabel,
  researchRollupLabel,
  shouldExpandResearchByDefault,
  shouldInlineResearch,
  shouldShowVerificationQueue,
  type ResearchFindingLike,
} from '@/lib/learning-presentation';
import { originalSourceLink } from '@/lib/original-source';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function recommendationLabel(value: NonNullable<LearningItem['card']>['personalization']): string {
  if (!value) return '';
  const tier = value.recommendationTier
    ?? (value.priority === 'high' ? 'do_now' : value.priority === 'medium' ? 'useful_for_goals' : 'worth_remembering');
  if (tier === 'do_now') return 'DO NOW';
  if (tier === 'useful_for_goals') return 'USEFUL FOR YOUR GOALS';
  return 'WORTH REMEMBERING';
}

function sourceName(item: LearningItem): string {
  if (item.creator) return item.creator;
  if (item.sourceType === 'uploaded_media') return 'Shared recording';
  if (item.sourceType === 'demo_fixture') return 'Curio sample';
  return `${label(item.platform)} source`;
}

function externalHref(value: string): Href {
  return value as Href;
}

function FindingSources({
  expanded,
  finding,
  onToggle,
}: {
  expanded: boolean;
  finding: ResearchFindingLike;
  onToggle: () => void;
}) {
  if (!finding.sources.length) return null;
  return (
    <View style={styles.researchSources}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.sourcesDisclosure}>
        <Text style={styles.sourcesDisclosureText}>
          {expanded ? 'Hide sources' : `${finding.sources.length} source${finding.sources.length === 1 ? '' : 's'}`}
        </Text>
        <Text style={styles.sourcesDisclosureIcon}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded && finding.sources.map((source) => (
        <Link asChild href={externalHref(source.url)} key={source.url} rel="noopener noreferrer" target="_blank">
          <Pressable accessibilityHint="Open this research source" style={styles.researchSource}>
            <Text numberOfLines={2} style={styles.researchSourceText}>{source.publisher} · {source.title}</Text>
            <Text style={styles.researchSourceArrow}>↗</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<LearningItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [showSourceNotes, setShowSourceNotes] = useState(false);
  const [showContextReceipt, setShowContextReceipt] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [expandedResearch, setExpandedResearch] = useState<Record<string, boolean>>({});
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    void getLearningItem(id).then(setItem).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Opening this find…</Text></View>;
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.missing}><Text style={styles.missingTitle}>This save isn’t here yet.</Text><Pressable onPress={() => router.dismissTo('/')} style={styles.darkButton}><Text style={styles.darkButtonText}>Back to Curio</Text></Pressable></View>
      </SafeAreaView>
    );
  }

  const card = item.card;
  const notes = card?.notes ?? [];
  const research = card?.researchBrief ?? null;
  const researchIsSupplement = research?.mode === 'independent_supplement';
  const inlineResearch = card ? shouldInlineResearch(card) : false;
  const units = card ? learningUnits(card) : [];
  const showVerificationQueue = card ? shouldShowVerificationQueue(card) : false;
  const personalization = card?.personalization ?? null;
  const originalSource = item.sourceUrl ? originalSourceLink(item.sourceUrl, item.platform) : null;
  const evidence = [
    item.sourceCaption && { label: 'Caption or supplied context', value: item.sourceCaption },
    item.transcript && { label: item.platform === 'instagram' ? 'Full Reel transcript' : 'Transcript', value: item.transcript },
    item.extractedVisualText && { label: item.platform === 'instagram' ? 'Timestamped Reel visuals' : 'Visible text', value: item.extractedVisualText },
  ].filter(Boolean) as { label: string; value: string }[];

  async function retryPublicRetrieval() {
    if (!item?.sourceUrl || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const result = await saveLink(item.sourceUrl, { intent: item.intent });
      setItem(result.item);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : 'Curio could not retry this source.');
    } finally {
      setRetrying(false);
    }
  }

  function toggleSources(key: string) {
    setExpandedSources((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleResearch(key: string) {
    setExpandedResearch((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.topbar}>
        <Pressable accessibilityLabel="Back to saved items" onPress={() => router.dismissTo('/')} style={styles.back}><Text style={styles.backText}>←</Text></Pressable>
        <CurioBrand compact />
        <View style={styles.topbarSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sourceRow}>
          <View style={styles.sourceAvatar}><Text style={styles.sourceAvatarText}>{sourceName(item).slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.sourceCopy}><Text style={styles.sourceLabel}>LEARNED FROM</Text><Text numberOfLines={1} style={styles.sourceName}>{sourceName(item)}</Text></View>
          {!card && <View style={[styles.status, styles.statusWaiting]}><Text style={[styles.statusText, styles.statusWaitingText]}>{label(item.accessLevel).toUpperCase()}</Text></View>}
        </View>

        {card ? (
          <>
            <View style={[styles.heroCard, shadows.card]}>
              <View style={styles.tagRow}>
                <View style={styles.topicTag}><Text style={styles.topicTagText}>{card.primaryTopic}</Text></View>
                <Text style={styles.contentType}>{learningFormatLabel(card.presentationType) || label(card.contentType)}</Text>
              </View>
              <Text style={styles.title}>{card.title}</Text>
              <Text style={styles.summary}>{card.summary}</Text>
            </View>

            {!researchIsSupplement && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{learningSectionTitle(card)}</Text>
                {inlineResearch && research && (
                  <View style={styles.researchRollup}>
                    <Text style={styles.researchRollupLabel}>RESEARCH</Text>
                    <Text style={styles.researchRollupText}>{researchRollupLabel(research.findings)}</Text>
                  </View>
                )}
                {units.map((unit, index) => {
                  const sourceKey = `unit-${index}`;
                  const disclosureLabel = unit.research ? researchDisclosureLabel(unit.research) : null;
                  const expandedByDefault = unit.research ? shouldExpandResearchByDefault(unit.research) : false;
                  const detailIsOpen = expandedByDefault || Boolean(expandedResearch[sourceKey]);
                  return (
                    <View key={`${index}-${card.keyTakeaways[index]}`} style={[styles.learningUnit, shadows.card]}>
                      <View style={styles.takeaway}>
                        <View style={styles.takeawayNumber}><Text style={styles.takeawayNumberText}>{index + 1}</Text></View>
                        <View style={styles.takeawayCopy}>
                          {unit.heading && <Text style={styles.takeawayHeading}>{unit.heading}</Text>}
                          <Text style={[styles.takeawayText, unit.heading && styles.takeawayDetail]}>{unit.detail}</Text>
                        </View>
                      </View>
                      {unit.research && disclosureLabel && !expandedByDefault && (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => toggleResearch(sourceKey)}
                          style={styles.researchDisclosure}>
                          <Text style={styles.researchDisclosureText}>{detailIsOpen ? 'Hide details' : disclosureLabel}</Text>
                          <Text style={styles.researchDisclosureIcon}>{detailIsOpen ? '−' : '+'}</Text>
                        </Pressable>
                      )}
                      {unit.research && detailIsOpen && (
                        <View style={styles.inlineResearch}>
                          {expandedByDefault && <Text style={styles.correctionStatus}>CORRECTED</Text>}
                          <Text style={styles.researchExplanation}>{unit.research.explanation}</Text>
                          {unit.research.correction && (
                            <View style={styles.correctionBlock}>
                              <Text style={styles.correctionLabel}>IMPORTANT CONTEXT</Text>
                              <Text style={styles.correctionText}>{unit.research.correction}</Text>
                            </View>
                          )}
                          <FindingSources
                            expanded={Boolean(expandedSources[sourceKey])}
                            finding={unit.research}
                            onToggle={() => toggleSources(sourceKey)}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
                {notes.length > 0 && (
                  <>
                    <Pressable
                      accessibilityHint="Show or hide the detailed notes extracted from the source"
                      accessibilityRole="button"
                      onPress={() => setShowSourceNotes((visible) => !visible)}
                      style={styles.disclosureButton}>
                      <Text style={styles.disclosureButtonText}>More from the source</Text>
                      <Text style={styles.disclosureButtonMeta}>{showSourceNotes ? 'Hide −' : `${notes.length} note${notes.length === 1 ? '' : 's'} +`}</Text>
                    </Pressable>
                    {showSourceNotes && (
                      <View style={styles.sourceNotes}>
                        {notes.map((note, index) => (
                          <View key={`${note.type}-${note.title}-${index}`} style={styles.noteRow}>
                            <Text style={styles.noteType}>{label(note.type).toUpperCase()}</Text>
                            <Text style={styles.noteTitle}>{note.title}</Text>
                            <Text style={styles.noteDetail}>{note.detail}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {research && !inlineResearch && (
              <View style={[styles.researchSection, researchIsSupplement && styles.researchSupplementSection]}>
                {researchIsSupplement && <Text style={styles.researchModeLabel}>CURIO RESEARCH · NOT FROM THE REEL</Text>}
                <Text style={styles.sectionTitle}>{researchIsSupplement ? `${research.findings.length} researched tip${research.findings.length === 1 ? '' : 's'}` : 'What the research adds'}</Text>
                <Text style={styles.researchOverview}>{research.overview}</Text>
                {research.findings.map((finding, index) => (
                  <View key={`${finding.topic}-${index}`} style={[styles.researchFinding, shadows.card]}>
                    <View style={styles.researchFindingHeader}>
                      <Text style={styles.researchVerdict}>{label(finding.verdict).toUpperCase()}</Text>
                      <Text style={styles.researchTopic}>{finding.topic}</Text>
                    </View>
                    <Text style={styles.researchExplanation}>{finding.explanation}</Text>
                    {finding.correction && (
                      <View style={styles.correctionBlock}>
                        <Text style={styles.correctionLabel}>CORRECTION / MISSING CONTEXT</Text>
                        <Text style={styles.correctionText}>{finding.correction}</Text>
                      </View>
                    )}
                    <FindingSources
                      expanded={Boolean(expandedSources[`research-${index}`])}
                      finding={finding}
                      onToggle={() => toggleSources(`research-${index}`)}
                    />
                  </View>
                ))}
              </View>
            )}

            {personalization ? (
              <View style={styles.personalizationSection}>
                <View style={styles.personalizationHeading}>
                  <Text style={styles.sectionTitle}>For you</Text>
                  <View style={styles.priorityPill}><Text style={styles.priorityPillText}>{recommendationLabel(personalization)}</Text></View>
                </View>
                <View style={[styles.contextCard, { backgroundColor: colors.sage }]}>
                  <Text style={styles.contextIcon}>◇</Text>
                  <Text style={styles.contextLabel}>WHY IT MATTERS</Text>
                  <Text style={styles.contextText}>{personalization.whyNow}</Text>
                </View>
                <View style={[styles.contextCard, { backgroundColor: colors.butter }]}>
                  <Text style={styles.contextIcon}>→</Text>
                  <Text style={styles.contextText}>{personalization.personalizedUse}</Text>
                  <View style={styles.personalizedNext}><Text style={styles.personalizedNextLabel}>ONE NEXT STEP</Text><Text style={styles.personalizedNextText}>{personalization.nextStep}</Text></View>
                </View>
                {personalization.contextUsed.length > 0 && (
                  <>
                    <Pressable
                      accessibilityHint="Show or hide the context used for this recommendation"
                      accessibilityRole="button"
                      onPress={() => setShowContextReceipt((visible) => !visible)}
                      style={styles.disclosureButton}>
                      <Text style={styles.disclosureButtonText}>Why this recommendation</Text>
                      <Text style={styles.disclosureButtonMeta}>{showContextReceipt ? 'Hide −' : `${personalization.contextUsed.length} signal${personalization.contextUsed.length === 1 ? '' : 's'} +`}</Text>
                    </Pressable>
                    {showContextReceipt && (
                      <View style={styles.contextReceipt}>
                        <Text style={styles.contextReceiptIntro}>Only matching {label(personalization.domain).toLocaleLowerCase()} context was included.</Text>
                        {personalization.contextUsed.map((entry) => (
                          <View key={entry.recordId} style={styles.contextSignal}>
                            <View style={styles.contextSignalTop}>
                              <Text style={styles.contextSignalKind}>{label(entry.kind).toUpperCase()}</Text>
                              {entry.isDemo && <Text style={styles.demoContext}>DEMO</Text>}
                            </View>
                            <Text style={styles.contextSignalText}>{entry.statement}</Text>
                            <Text style={styles.contextSignalSource}>{entry.sourceLabel}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            ) : (
              <View style={styles.personalizationSection}>
                <Text style={styles.sectionTitle}>For you</Text>
                <View style={[styles.contextCard, { backgroundColor: colors.sage }]}>
                  <Text style={styles.contextIcon}>◇</Text>
                  <Text style={styles.contextLabel}>WHY IT MATTERS</Text>
                  <Text style={styles.contextText}>{card.relevanceReason}</Text>
                </View>
                <View style={[styles.contextCard, { backgroundColor: colors.butter }]}>
                  <Text style={styles.contextIcon}>→</Text>
                  <Text style={styles.contextLabel}>ONE NEXT STEP</Text>
                  <Text style={styles.contextText}>{card.suggestedAction}</Text>
                </View>
              </View>
            )}

            {showVerificationQueue && (
              <View style={styles.verifyCard}>
                <Text style={styles.verifyLabel}>△ VERIFY BEFORE RELYING ON IT</Text>
                {card.claimsToVerify.map((claim, index) => (
                  <View key={`${index}-${claim.claim}`} style={styles.claim}>
                    <Text style={styles.claimText}>{claim.claim}</Text>
                    <Text style={styles.claimReason}>{claim.reasonToVerify}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.sourceOnly, shadows.card]}>
            <Text style={styles.eyebrow}>SAVED WITHOUT GUESSING</Text>
            <Text style={styles.sourceOnlyTitle}>The link is here. Its lesson still needs evidence.</Text>
            <Text style={styles.sourceOnlyCopy}>{item.issues[0]?.message || 'Share a recording or add the source caption before Curio generates a Learning Card.'}</Text>
            {retryError && <Text style={styles.retryError}>{retryError}</Text>}
            {item.sourceUrl && (
              <Pressable disabled={retrying} onPress={() => void retryPublicRetrieval()} style={[styles.darkButton, retrying && styles.buttonDisabled]}>
                {retrying && <ActivityIndicator color={colors.surface} size="small" />}
                <Text style={styles.darkButtonText}>{retrying ? 'Looking for public evidence…' : 'Try AI retrieval again'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => router.push('/capture')} style={styles.contextButton}><Text style={styles.contextButtonText}>Add context or a recording</Text></Pressable>
          </View>
        )}

        <View style={styles.evidenceSection}>
          <Pressable
            accessibilityHint="Show or hide the material Curio analyzed"
            accessibilityRole="button"
            onPress={() => setShowEvidence((visible) => !visible)}
            style={styles.evidenceDisclosure}>
            <View style={styles.evidenceDisclosureCopy}>
              <Text style={styles.evidenceTitle}>Source & evidence</Text>
              <Text style={styles.evidenceMeta}>{evidence.length ? `${evidence.length} evidence channel${evidence.length === 1 ? '' : 's'}` : 'No source text available'}</Text>
            </View>
            <Text style={styles.evidenceToggle}>{showEvidence ? '−' : '+'}</Text>
          </Pressable>
          {showEvidence && (
            <View style={styles.evidenceContent}>
              <Text style={styles.evidenceIntro}>{evidence.length ? 'This is the source material Curio used for the card.' : 'No caption, transcript, or visible text was available from this link.'}</Text>
              {evidence.map((entry) => (
                <View key={entry.label} style={styles.evidenceBlock}>
                  <Text style={styles.evidenceLabel}>{entry.label.toUpperCase()}</Text>
                  <Text numberOfLines={8} style={styles.evidenceText}>{entry.value}</Text>
                </View>
              ))}
            </View>
          )}
          {originalSource ? (
            <Link asChild href={externalHref(originalSource.href)} rel="noopener noreferrer" target={originalSource.target}>
              <Pressable accessibilityHint={`Open the original ${label(item.platform)} source`} style={styles.sourceButton}>
                <Text style={styles.sourceButtonText}>{originalSource.label}</Text><Text style={styles.sourceButtonText}>↗</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  loading: { alignItems: 'center', backgroundColor: colors.canvas, flex: 1, gap: 12, justifyContent: 'center' },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  backText: { color: colors.ink, fontSize: 21 },
  topbarSpacer: { width: 36 },
  content: { paddingBottom: 42, paddingHorizontal: 18, paddingTop: 16 },
  sourceRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 18 },
  sourceAvatar: { alignItems: 'center', backgroundColor: colors.peach, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  sourceAvatarText: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: '700' },
  sourceCopy: { flex: 1, marginLeft: 11 },
  sourceLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  sourceName: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: '800', marginTop: 2 },
  status: { backgroundColor: '#DCE9D8', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  statusWaiting: { backgroundColor: '#E8E3D8' },
  statusText: { color: colors.success, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  statusWaitingText: { color: colors.muted },
  heroCard: { backgroundColor: colors.surface, borderRadius: 28, padding: 23 },
  tagRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  topicTag: { backgroundColor: colors.peach, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  topicTagText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  contentType: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, fontWeight: '700', letterSpacing: -1.3, lineHeight: 37, marginTop: 19 },
  summary: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 15 },
  noteRow: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 17 },
  noteType: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  noteTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: '700', marginTop: 5 },
  noteDetail: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 7 },
  section: { paddingVertical: 34 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.8, marginBottom: 16, marginTop: 4 },
  disclosureButton: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, paddingVertical: 15 },
  disclosureButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
  disclosureButtonMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  sourceNotes: { marginTop: 2 },
  learningUnit: { backgroundColor: colors.surface, borderRadius: 22, marginBottom: 13, padding: 18 },
  takeaway: { alignItems: 'flex-start', flexDirection: 'row', gap: 13 },
  takeawayNumber: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
  takeawayNumberText: { color: colors.surface, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  takeawayCopy: { flex: 1 },
  takeawayHeading: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: '700', lineHeight: 23 },
  takeawayText: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  takeawayDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  researchRollup: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: -8 },
  researchRollupLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  researchRollupText: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  researchDisclosure: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 12 },
  researchDisclosureText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  researchDisclosureIcon: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  inlineResearch: { backgroundColor: colors.canvas, borderRadius: 15, marginTop: 13, padding: 14 },
  correctionStatus: { color: colors.danger, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  researchSection: { paddingBottom: 30 },
  researchSupplementSection: { paddingTop: 34 },
  researchModeLabel: { color: colors.success, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  researchOverview: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 20, marginBottom: 15, marginTop: -7 },
  researchFinding: { backgroundColor: colors.surface, borderRadius: 22, marginBottom: 13, padding: 19 },
  researchFindingHeader: { gap: 5 },
  researchVerdict: { color: colors.success, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  researchTopic: { color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: '700', lineHeight: 25 },
  researchExplanation: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 11 },
  correctionBlock: { backgroundColor: colors.butter, borderRadius: 15, marginTop: 14, padding: 13 },
  correctionLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  correctionText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 5 },
  researchSources: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 5 },
  sourcesDisclosure: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  sourcesDisclosureText: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  sourcesDisclosureIcon: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, fontWeight: '700' },
  researchSource: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  researchSourceText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', lineHeight: 14, marginRight: 10 },
  researchSourceArrow: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
  contextCard: { borderRadius: 24, marginBottom: 13, padding: 21 },
  personalizationSection: { paddingTop: 4 },
  personalizationHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  priorityPill: { backgroundColor: '#DCE9D8', borderRadius: 14, marginTop: 3, paddingHorizontal: 9, paddingVertical: 7 },
  priorityPillText: { color: colors.success, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  contextIcon: { color: colors.ink, fontSize: 22 },
  contextLabel: { color: 'rgba(23,23,19,0.65)', fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginTop: 17 },
  contextText: { color: colors.ink, fontFamily: fonts.display, fontSize: 21, fontWeight: '700', lineHeight: 27, marginTop: 8 },
  personalizedNext: { borderTopColor: 'rgba(23,23,19,0.16)', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 13 },
  personalizedNextLabel: { color: 'rgba(23,23,19,0.6)', fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  personalizedNextText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', lineHeight: 17, marginTop: 5 },
  contextReceipt: { borderColor: colors.line, borderRadius: 22, borderWidth: 1, marginBottom: 23, marginTop: 2, padding: 18 },
  contextReceiptIntro: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  contextSignal: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 13 },
  contextSignalTop: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  contextSignalKind: { color: colors.success, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  demoContext: { backgroundColor: colors.lilac, borderRadius: 8, color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3 },
  contextSignalText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 6 },
  contextSignalSource: { color: colors.muted, fontFamily: fonts.body, fontSize: 8, marginTop: 5 },
  verifyCard: { borderColor: '#C89E92', borderRadius: 24, borderWidth: 1, marginTop: 8, padding: 20 },
  verifyLabel: { color: colors.danger, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  claim: { marginTop: 15 },
  claimText: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  claimReason: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 5 },
  sourceOnly: { backgroundColor: colors.surface, borderRadius: 28, padding: 24 },
  sourceOnlyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 31, fontWeight: '700', letterSpacing: -1, lineHeight: 34, marginTop: 9 },
  sourceOnlyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 13 },
  darkButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.dark, borderRadius: 15, flexDirection: 'row', gap: 8, marginTop: 20, paddingHorizontal: 17, paddingVertical: 13 },
  darkButtonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 11, fontWeight: '800' },
  buttonDisabled: { opacity: 0.7 },
  contextButton: { alignSelf: 'flex-start', marginTop: 15, paddingVertical: 5 },
  contextButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  retryError: { color: colors.danger, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 13 },
  evidenceSection: { paddingTop: 38 },
  evidenceDisclosure: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 23, flexDirection: 'row', padding: 18 },
  evidenceDisclosureCopy: { flex: 1 },
  evidenceTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', letterSpacing: -0.7 },
  evidenceMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 4 },
  evidenceToggle: { color: colors.ink, fontFamily: fonts.body, fontSize: 22, marginLeft: 14 },
  evidenceContent: { marginTop: 16 },
  evidenceIntro: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginBottom: 16 },
  evidenceBlock: { backgroundColor: 'rgba(255,252,246,0.62)', borderRadius: 18, marginBottom: 10, padding: 16 },
  evidenceLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  evidenceText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 7 },
  sourceButton: { alignItems: 'center', borderColor: colors.ink, borderRadius: 15, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 9, paddingHorizontal: 16, paddingVertical: 14 },
  sourceButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800' },
  missing: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  missingTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', textAlign: 'center' },
});
