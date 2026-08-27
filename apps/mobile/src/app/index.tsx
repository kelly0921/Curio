import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { CurioBrand } from '@/components/curio-brand';
import { ResourceTile } from '@/components/resource-tile';
import { colors, fonts } from '@/constants/curio-theme';
import {
  CurioApiError,
  getCurioApiUrl,
  listKnowledgeResources,
  searchKnowledgeLibrary,
  updateResourceFollowThrough,
  type ContextDomain,
  type KnowledgeResource,
  type KnowledgeSearchResult,
} from '@/lib/curio-api';
import { resourceFollowThroughKind } from '@/lib/resource-presentation';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function resourceCountLabel(count: number): string {
  return `${count} resource${count === 1 ? '' : 's'}`;
}

function searchableText(resource: KnowledgeResource): string {
  return [
    resource.title,
    resource.summary,
    resource.canonicalTopic,
    resource.domain,
    resource.resourceType,
    ...resource.entities,
    ...resource.entries.flatMap((entry) => [
      entry.heading,
      entry.detail,
      entry.research?.explanation,
      entry.research?.correction,
      ...(entry.deepDives ?? []).flatMap((deepDive) => [deepDive.question, deepDive.answer]),
    ]),
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function looksLikeQuestion(value: string): boolean {
  const normalized = value.trim();
  return normalized.endsWith('?')
    || /^(?:how|what|why|which|when|where|who|can|could|should|is|are|do|does|did|explain|tell me)\b/iu.test(normalized);
}

export default function HomeScreen() {
  const [resources, setResources] = useState<KnowledgeResource[]>([]);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<KnowledgeSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [followThroughResourceIds, setFollowThroughResourceIds] = useState<Set<string>>(() => new Set());
  const [followThroughUpdatingId, setFollowThroughUpdatingId] = useState<string | null>(null);
  const [followThroughError, setFollowThroughError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      setResources(await listKnowledgeResources());
      setError(null);
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not load your knowledge library.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSearchResult(null);
      setSearchError(null);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      void searchKnowledgeLibrary(normalized, domain === 'all' ? null : (domain as ContextDomain))
        .then((result) => {
          if (!cancelled) {
            setSearchResult(result);
            setFollowThroughResourceIds(new Set(result.followThroughResourceIds ?? []));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResult(null);
            setSearchError('Curio could not search every source, so these are exact library matches.');
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [domain, query]);

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    resources.forEach((resource) => counts.set(resource.domain, (counts.get(resource.domain) ?? 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [resources]);

  const visibleResources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const resolvedSearch = searchResult?.query.toLocaleLowerCase() === normalizedQuery ? searchResult : null;
    if (normalizedQuery && resolvedSearch) {
      return resolvedSearch.results.map((result) => result.resource);
    }
    return resources.filter((resource) => {
      if (domain !== 'all' && resource.domain !== domain) return false;
      return !normalizedQuery || searchableText(resource).includes(normalizedQuery);
    });
  }, [domain, query, resources, searchResult]);

  const showCollections = collections.length > 1 && !query.trim();
  const hasQuery = Boolean(query.trim());
  const resolvedSearch = searchResult?.query.toLocaleLowerCase() === query.trim().toLocaleLowerCase() ? searchResult : null;
  const answer = resolvedSearch?.answer ?? null;
  const answerResourcesById = useMemo(() => new Map(
    (resolvedSearch?.results ?? []).map((result) => [result.resource.id, result.resource]),
  ), [resolvedSearch]);
  const questionMode = hasQuery && looksLikeQuestion(query);

  async function handleFollowThrough(resourceId: string) {
    if (followThroughUpdatingId) return;
    if (followThroughResourceIds.has(resourceId)) {
      router.push('/priorities');
      return;
    }
    setFollowThroughUpdatingId(resourceId);
    setFollowThroughError(null);
    try {
      await updateResourceFollowThrough(resourceId, { action: 'start' });
      setFollowThroughResourceIds((current) => new Set(current).add(resourceId));
    } catch (caught) {
      setFollowThroughError(caught instanceof CurioApiError ? caught.message : 'Curio could not add that to For You.');
    } finally {
      setFollowThroughUpdatingId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlatList
          columnWrapperStyle={visibleResources.length > 1 ? styles.columns : undefined}
          contentContainerStyle={styles.content}
          data={visibleResources}
          keyExtractor={(resource) => resource.id}
          keyboardDismissMode="on-drag"
          ListHeaderComponent={(
            <View>
              <View style={styles.topbar}>
                <CurioBrand compact />
                <Pressable accessibilityLabel="Add a link" onPress={() => router.push('/capture')} style={({ pressed }) => [styles.topAdd, pressed && styles.pressed]}>
                  <Text style={styles.topAddIcon}>＋</Text>
                </Pressable>
              </View>

              <View style={styles.hero}>
                <Text style={styles.eyebrow}>MY CURIO</Text>
                <Text style={styles.heading}>Library</Text>
                <Text style={styles.intro}>Your saves, merged into knowledge you can find and keep building.</Text>
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>⌕</Text>
                  <TextInput
                    accessibilityLabel="Search your knowledge"
                    autoCapitalize="none"
                    onChangeText={setQuery}
                    placeholder="Search or ask anything you saved"
                    placeholderTextColor="#958F83"
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={query}
                  />
                  {searching && <ActivityIndicator color={colors.muted} size="small" />}
                  {hasQuery && !searching && (
                    <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearSearch}>
                      <Text style={styles.clearSearchText}>×</Text>
                    </Pressable>
                  )}
                </View>
                {searchError && <Text style={styles.searchFallback}>{searchError}</Text>}
                <Pressable onPress={() => router.push('/sources')} style={styles.sourceArchiveLink}>
                  <Text style={styles.sourceArchiveText}>View original saves</Text>
                  <Text style={styles.sourceArchiveArrow}>→</Text>
                </Pressable>
              </View>

              {error && (
                <View style={styles.offlineBanner}>
                  <Text style={styles.offlineTitle}>Knowledge library unavailable</Text>
                  <Text style={styles.offlineCopy}>{error}</Text>
                  <Text selectable style={styles.apiAddress}>{getCurioApiUrl()}</Text>
                </View>
              )}

              {answer && (
                <View style={styles.answerCard}>
                  <Text style={styles.answerEyebrow}>{questionMode ? 'ANSWERED FROM YOUR LIBRARY' : 'BEST MATCHES FROM YOUR SAVES'}</Text>
                  <Text style={styles.answerTitle}>{questionMode ? 'What Curio found' : answer.title}</Text>
                  <Text style={styles.answerSummary}>{answer.summary}</Text>
                  <View style={styles.answerPoints}>
                    {answer.points.slice(0, 4).map((point) => {
                      const answerResource = answerResourcesById.get(point.resourceId);
                      const actionable = answerResource ? resourceFollowThroughKind(answerResource) !== null : false;
                      const active = followThroughResourceIds.has(point.resourceId);
                      const updating = followThroughUpdatingId === point.resourceId;
                      return (
                        <View key={`${point.resourceId}:${point.entryId}`} style={styles.answerPoint}>
                          <Pressable
                            accessibilityLabel={`Open ${point.resourceTitle}`}
                            onPress={() => router.push({ pathname: '/resource/[id]', params: { id: point.resourceId } })}
                            style={({ pressed }) => [styles.answerPointBody, pressed && styles.answerPointPressed]}>
                            <View style={styles.answerPointTopline}>
                              <Text numberOfLines={1} style={styles.answerPointResource}>{point.resourceTitle}</Text>
                              <Text style={styles.answerPointArrow}>→</Text>
                            </View>
                            {point.heading && <Text style={styles.answerPointHeading}>{point.heading}</Text>}
                            <Text style={styles.answerPointText}>{point.detail}</Text>
                          </Pressable>
                          <View style={styles.answerPointActions}>
                            <Text style={styles.answerEvidence}>{point.evidence}</Text>
                            {actionable && <Pressable
                              accessibilityLabel={active ? `Open ${point.resourceTitle} in For You` : `Add ${point.resourceTitle} to For You`}
                              disabled={Boolean(followThroughUpdatingId)}
                              onPress={() => void handleFollowThrough(point.resourceId)}
                              style={[styles.answerUseButton, active && styles.answerUseButtonActive]}>
                              {updating
                                ? <ActivityIndicator color={colors.ink} size="small" />
                                : <Text style={[styles.answerUseButtonText, active && styles.answerUseButtonTextActive]}>{active ? '✓ In For You' : 'Use this'}</Text>}
                            </Pressable>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {followThroughError && <Text style={styles.answerActionError}>{followThroughError}</Text>}
                  {answer.caveat && (
                    <View style={styles.answerCaveat}>
                      <Text style={styles.answerCaveatLabel}>KEEP IN MIND</Text>
                      <Text style={styles.answerCaveatText}>{answer.caveat}</Text>
                    </View>
                  )}
                  <View style={styles.answerFooter}>
                    <Text style={styles.answerSourceCount}>{answer.resourceCount} resource{answer.resourceCount === 1 ? '' : 's'} · {answer.sourceCount} saved source{answer.sourceCount === 1 ? '' : 's'}</Text>
                    <Text style={styles.answerPrivate}>Private library answer</Text>
                  </View>
                </View>
              )}

              {showCollections && (
                <>
                  <View style={styles.sectionHeading}>
                    <Text style={styles.sectionTitle}>Collections</Text>
                    <Text style={styles.sectionMeta}>{collections.length} area{collections.length === 1 ? '' : 's'}</Text>
                  </View>
                  <ScrollView contentContainerStyle={styles.collectionRow} horizontal showsHorizontalScrollIndicator={false}>
                    <Pressable onPress={() => setDomain('all')} style={[styles.collection, domain === 'all' && styles.collectionActive]}>
                      <View style={[styles.collectionDot, { backgroundColor: colors.dark }]}><Text style={styles.collectionDotLight}>✦</Text></View>
                      <View><Text style={styles.collectionName}>Everything</Text><Text style={styles.collectionCount}>{resourceCountLabel(resources.length)}</Text></View>
                    </Pressable>
                    {collections.map(([key, count], index) => (
                      <Pressable key={key} onPress={() => setDomain(key)} style={[styles.collection, domain === key && styles.collectionActive]}>
                        <View style={[styles.collectionDot, { backgroundColor: [colors.peach, colors.sage, colors.sky, colors.lilac][index % 4] }]}>
                          <Text style={styles.collectionLetter}>{label(key).slice(0, 1)}</Text>
                        </View>
                        <View><Text numberOfLines={1} style={styles.collectionName}>{label(key)}</Text><Text style={styles.collectionCount}>{resourceCountLabel(count)}</Text></View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {(showCollections || (hasQuery && visibleResources.length > 0)) && (
                <View style={[styles.sectionHeading, styles.libraryHeading]}>
                  <Text style={styles.sectionTitle}>{hasQuery ? answer ? 'Related resources' : 'Results' : domain === 'all' ? 'Living resources' : label(domain)}</Text>
                  <Text style={styles.sectionMeta}>{resourceCountLabel(visibleResources.length)}</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={loading || (searching && hasQuery && !answer) ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.loadingText}>{hasQuery ? 'Searching across your saves…' : 'Building your knowledge library…'}</Text>
            </View>
          ) : answer ? (
            <View />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✦</Text></View>
              <Text style={styles.emptyTitle}>{query ? 'Nothing found yet' : 'Start one living resource'}</Text>
              <Text style={styles.emptyCopy}>{query ? 'Try a broader idea or clear the search.' : 'Share a useful Reel or link. Curio will turn it into knowledge and merge future saves into it.'}</Text>
              {!query && <Pressable onPress={() => router.push('/capture')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Add your first source</Text></Pressable>}
            </View>
          )}
          numColumns={2}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          renderItem={({ item, index }) => (
            <View style={styles.tileCell}>
              <ResourceTile index={index} resource={item} onPress={() => router.push({ pathname: '/resource/[id]', params: { id: item.id } })} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
      <CurioBottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: 18 },
  columns: { gap: 12 },
  tileCell: { flex: 0.5, marginBottom: 14 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 25, paddingTop: 12 },
  topAdd: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  topAddIcon: { color: colors.surface, fontSize: 20, lineHeight: 23 },
  pressed: { opacity: 0.72 },
  hero: { paddingBottom: 31 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 52, fontWeight: '700', letterSpacing: -2.5, lineHeight: 58, marginTop: 2 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, marginTop: 6, maxWidth: 330 },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 22, paddingHorizontal: 14 },
  searchIcon: { color: colors.muted, fontSize: 24, marginTop: -2 },
  searchInput: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 14, height: 51 },
  clearSearch: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  clearSearchText: { color: colors.muted, fontFamily: fonts.body, fontSize: 22, lineHeight: 24 },
  searchFallback: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 8 },
  sourceArchiveLink: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 13, paddingVertical: 5, width: 150 },
  sourceArchiveText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: '800' },
  sourceArchiveArrow: { color: colors.muted, fontSize: 12 },
  offlineBanner: { backgroundColor: '#F3DFD4', borderRadius: 18, marginBottom: 28, padding: 16 },
  offlineTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  offlineCopy: { color: '#735C51', fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  apiAddress: { color: '#735C51', fontFamily: 'monospace', fontSize: 10, marginTop: 8 },
  answerCard: { backgroundColor: colors.dark, borderRadius: 25, marginBottom: 6, padding: 20 },
  answerEyebrow: { color: colors.butter, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  answerTitle: { color: colors.surface, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, lineHeight: 32, marginTop: 7 },
  answerSummary: { color: '#D7D4CA', fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  answerPoints: { borderTopColor: '#4A4B43', borderTopWidth: StyleSheet.hairlineWidth, gap: 9, marginTop: 15, paddingTop: 14 },
  answerPoint: { backgroundColor: '#2C2D27', borderRadius: 16, overflow: 'hidden' },
  answerPointBody: { paddingHorizontal: 13, paddingTop: 13 },
  answerPointPressed: { opacity: 0.72 },
  answerPointTopline: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  answerPointResource: { color: colors.butter, flex: 1, fontFamily: fonts.body, fontSize: 9, fontWeight: '900' },
  answerPointArrow: { color: colors.butter, fontFamily: fonts.body, fontSize: 11 },
  answerPointHeading: { color: colors.surface, fontFamily: fonts.body, fontSize: 11, fontWeight: '900', lineHeight: 16, marginTop: 8 },
  answerPointText: { color: '#E4E0D7', fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 4 },
  answerPointActions: { alignItems: 'center', borderTopColor: '#41423C', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, minHeight: 47, paddingHorizontal: 13, paddingVertical: 8 },
  answerEvidence: { color: '#A9A69E', flex: 1, fontFamily: fonts.body, fontSize: 8, fontWeight: '800', paddingRight: 8, textTransform: 'uppercase' },
  answerUseButton: { alignItems: 'center', backgroundColor: colors.butter, borderRadius: 11, justifyContent: 'center', minHeight: 30, minWidth: 74, paddingHorizontal: 10 },
  answerUseButtonActive: { backgroundColor: '#45463F' },
  answerUseButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 8, fontWeight: '900' },
  answerUseButtonTextActive: { color: colors.surface },
  answerActionError: { color: colors.peach, fontFamily: fonts.body, fontSize: 9, lineHeight: 14, marginTop: 10 },
  answerCaveat: { borderLeftColor: colors.peach, borderLeftWidth: 2, marginTop: 14, paddingLeft: 10 },
  answerCaveatLabel: { color: colors.peach, fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  answerCaveatText: { color: '#D7D4CA', fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 4 },
  answerFooter: { alignItems: 'center', borderTopColor: '#4A4B43', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 13 },
  answerSourceCount: { color: '#B8B5AB', fontFamily: fonts.body, fontSize: 9, fontWeight: '700' },
  answerPrivate: { color: '#8F8C84', fontFamily: fonts.body, fontSize: 8, fontWeight: '800' },
  sectionHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  libraryHeading: { marginTop: 34 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700', letterSpacing: -0.8, marginTop: 2 },
  sectionMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, paddingBottom: 3 },
  collectionRow: { gap: 10, paddingRight: 18 },
  collection: { alignItems: 'center', backgroundColor: 'rgba(255,252,246,0.55)', borderColor: 'transparent', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 10, minWidth: 148, padding: 10 },
  collectionActive: { backgroundColor: colors.surface, borderColor: colors.ink },
  collectionDot: { alignItems: 'center', borderRadius: 15, height: 45, justifyContent: 'center', width: 45 },
  collectionDotLight: { color: colors.surface, fontSize: 18 },
  collectionLetter: { color: colors.ink, fontFamily: fonts.display, fontSize: 19, fontWeight: '700' },
  collectionName: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800', maxWidth: 82 },
  collectionCount: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  loading: { alignItems: 'center', gap: 11, paddingVertical: 50 },
  loadingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 38 },
  emptyMark: { alignItems: 'center', backgroundColor: colors.butter, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  emptyMarkText: { color: colors.ink, fontSize: 24 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: '700', marginTop: 18 },
  emptyCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 260, textAlign: 'center' },
  primaryButton: { backgroundColor: colors.dark, borderRadius: 16, marginTop: 20, paddingHorizontal: 20, paddingVertical: 14 },
  primaryButtonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
});
