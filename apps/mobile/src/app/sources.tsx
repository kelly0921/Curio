import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBottomBar } from '@/components/curio-bottom-bar';
import { SavedTile } from '@/components/saved-tile';
import { colors, fonts } from '@/constants/curio-theme';
import { listLearningItems, type LearningItem } from '@/lib/curio-api';

function searchableText(item: LearningItem): string {
  return [item.card?.title, item.card?.summary, item.card?.primaryTopic, item.creator, item.platform]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

export default function SourcesScreen() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    try {
      setItems(await listLearningItems());
      setError(null);
    } catch {
      setError('Curio could not load the original sources.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter((item) => !normalized || searchableText(item).includes(normalized));
  }, [items, query]);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <FlatList
          columnWrapperStyle={visibleItems.length > 1 ? styles.columns : undefined}
          contentContainerStyle={styles.content}
          data={visibleItems}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={(
            <View style={styles.header}>
              <Pressable accessibilityLabel="Back to knowledge library" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
              <Text style={styles.eyebrow}>SOURCE ARCHIVE</Text>
              <Text style={styles.heading}>Original saves</Text>
              <Text style={styles.intro}>Every Reel and link stays here as evidence behind your living resources.</Text>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  accessibilityLabel="Search original saves"
                  autoCapitalize="none"
                  onChangeText={setQuery}
                  placeholder="Search sources"
                  placeholderTextColor="#958F83"
                  style={styles.searchInput}
                  value={query}
                />
              </View>
              <View style={styles.countRow}><Text style={styles.countTitle}>Sources</Text><Text style={styles.count}>{visibleItems.length}</Text></View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          )}
          ListEmptyComponent={loading ? <View style={styles.loading}><ActivityIndicator color={colors.ink} /></View> : <Text style={styles.empty}>No matching sources.</Text>}
          numColumns={2}
          refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.ink} />}
          renderItem={({ item, index }) => (
            <View style={styles.tileCell}><SavedTile index={index} item={item} onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} /></View>
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
  header: { paddingBottom: 20 },
  backButton: { alignItems: 'center', borderColor: colors.line, borderRadius: 17, borderWidth: 1, height: 36, justifyContent: 'center', marginBottom: 25, marginTop: 12, width: 36 },
  backText: { color: colors.ink, fontSize: 19 },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.ink, fontFamily: fonts.display, fontSize: 43, fontWeight: '700', letterSpacing: -1.8, lineHeight: 49, marginTop: 3 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 6, maxWidth: 335 },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 20, paddingHorizontal: 14 },
  searchIcon: { color: colors.muted, fontSize: 24, marginTop: -2 },
  searchInput: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 14, height: 50 },
  countRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  countTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, fontWeight: '700' },
  count: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, paddingBottom: 3 },
  columns: { gap: 12 },
  tileCell: { flex: 0.5, marginBottom: 14 },
  loading: { alignItems: 'center', paddingVertical: 50 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, paddingVertical: 40, textAlign: 'center' },
  error: { backgroundColor: colors.peach, borderRadius: 14, color: colors.ink, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 14, padding: 12 },
});
