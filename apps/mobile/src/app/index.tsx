import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { SavedTile } from '@/components/saved-tile';
import { colors, fonts } from '@/constants/curio-theme';
import { CurioApiError, getCurioApiUrl, listLearningItems, type LearningItem } from '@/lib/curio-api';

function topicKey(item: LearningItem): string {
  return item.card?.primaryTopic?.trim().toLocaleLowerCase() || 'needs source';
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function searchableText(item: LearningItem): string {
  return [item.card?.title, item.card?.summary, item.card?.primaryTopic, item.creator, item.platform]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export default function HomeScreen() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      const nextItems = await listLearningItems();
      setItems(nextItems);
      setError(null);
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not load your saves.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => counts.set(topicKey(item), (counts.get(topicKey(item)) ?? 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (topic !== 'all' && topicKey(item) !== topic) return false;
      return !normalizedQuery || searchableText(item).includes(normalizedQuery);
    });
  }, [items, query, topic]);

  const readyCount = items.filter((item) => Boolean(item.card)).length;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlatList
          columnWrapperStyle={visibleItems.length > 1 ? styles.columns : undefined}
          contentContainerStyle={styles.content}
          data={visibleItems}
          keyExtractor={(item) => item.id}
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
                <Text style={styles.heading}>Saved</Text>
                <Text style={styles.intro}>Everything interesting, organized into ideas you can actually find again.</Text>
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>⌕</Text>
                  <TextInput
                    accessibilityLabel="Search your saves"
                    autoCapitalize="none"
                    onChangeText={setQuery}
                    placeholder="Search ideas, creators, topics"
                    placeholderTextColor="#958F83"
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={query}
                  />
                </View>
              </View>

              {error && (
                <View style={styles.offlineBanner}>
                  <Text style={styles.offlineTitle}>Processor not connected</Text>
                  <Text style={styles.offlineCopy}>{error}</Text>
                  <Text selectable style={styles.apiAddress}>{getCurioApiUrl()}</Text>
                </View>
              )}

              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.eyebrow}>BROWSE</Text>
                  <Text style={styles.sectionTitle}>Collections</Text>
                </View>
                <Text style={styles.sectionMeta}>{collections.length || 'No'} topics</Text>
              </View>
              <ScrollView contentContainerStyle={styles.collectionRow} horizontal showsHorizontalScrollIndicator={false}>
                <Pressable onPress={() => setTopic('all')} style={[styles.collection, topic === 'all' && styles.collectionActive]}>
                  <View style={[styles.collectionDot, { backgroundColor: colors.dark }]}><Text style={styles.collectionDotLight}>✦</Text></View>
                  <View><Text style={styles.collectionName}>Everything</Text><Text style={styles.collectionCount}>{items.length} saves</Text></View>
                </Pressable>
                {collections.map(([key, count], index) => (
                  <Pressable key={key} onPress={() => setTopic(key)} style={[styles.collection, topic === key && styles.collectionActive]}>
                    <View style={[styles.collectionDot, { backgroundColor: [colors.peach, colors.sage, colors.sky, colors.lilac][index % 4] }]}>
                      <Text style={styles.collectionLetter}>{label(key).slice(0, 1)}</Text>
                    </View>
                    <View><Text numberOfLines={1} style={styles.collectionName}>{label(key)}</Text><Text style={styles.collectionCount}>{count} save{count === 1 ? '' : 's'}</Text></View>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={[styles.sectionHeading, styles.libraryHeading]}>
                <View>
                  <Text style={styles.eyebrow}>LIBRARY</Text>
                  <Text style={styles.sectionTitle}>{topic === 'all' ? 'All saves' : label(topic)}</Text>
                </View>
                <Text style={styles.sectionMeta}>{readyCount} ready · {items.length - readyCount} waiting</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.loadingText}>Opening your Curio…</Text></View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>✦</Text></View>
              <Text style={styles.emptyTitle}>{query ? 'Nothing found yet' : 'Start with one curiosity'}</Text>
              <Text style={styles.emptyCopy}>{query ? 'Try a broader word or another collection.' : 'Share a useful Instagram or TikTok link to Curio, or paste one here.'}</Text>
              {!query && <Pressable onPress={() => router.push('/capture')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save your first find</Text></Pressable>}
            </View>
          )}
          numColumns={2}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          renderItem={({ item, index }) => (
            <View style={styles.tileCell}>
              <SavedTile index={index} item={item} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} />
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
  offlineBanner: { backgroundColor: '#F3DFD4', borderRadius: 18, marginBottom: 28, padding: 16 },
  offlineTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  offlineCopy: { color: '#735C51', fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  apiAddress: { color: '#735C51', fontFamily: 'monospace', fontSize: 10, marginTop: 8 },
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
