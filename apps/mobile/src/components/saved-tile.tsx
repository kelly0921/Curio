import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/constants/curio-theme';
import type { LearningItem } from '@/lib/curio-api';

const tileColors = [colors.peach, colors.sage, colors.sky, colors.lilac, colors.butter] as const;

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function itemTitle(item: LearningItem): string {
  if (item.card?.title) return item.card.title;
  if (item.creator) return item.creator;
  if (item.sourceType === 'uploaded_media') return 'Shared recording';
  try {
    return item.sourceUrl ? new URL(item.sourceUrl).hostname.replace(/^www\./u, '') : 'Saved find';
  } catch {
    return 'Saved find';
  }
}

function platformMark(item: LearningItem): string {
  if (item.platform === 'instagram') return '◎';
  if (item.platform === 'youtube') return '▶';
  if (item.platform === 'tiktok') return '♪';
  if (item.platform === 'local') return '↑';
  return '↗';
}

export function SavedTile({ item, index, onPress }: { item: LearningItem; index: number; onPress: () => void }) {
  const topic = item.card?.primaryTopic || (item.card ? 'Curiosity' : 'Needs source');
  const isRecommended = Boolean(item.card?.personalization);
  return (
    <Pressable
      accessibilityHint="Open the saved Learning Card"
      accessibilityLabel={itemTitle(item)}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, shadows.card, pressed && styles.pressed]}>
      <View style={[styles.visual, { backgroundColor: tileColors[index % tileColors.length] }]}>
        <Text style={styles.platformMark}>{platformMark(item)}</Text>
        <Text style={styles.platform}>{label(item.platform)}</Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.topic}>{label(topic)}</Text>
        <Text numberOfLines={3} style={styles.title}>{itemTitle(item)}</Text>
        {!item.card ? (
          <Text style={[styles.state, styles.waiting]}>{item.accessLevel === 'link_only' ? 'Needs source' : label(item.processingStatus)}</Text>
        ) : isRecommended ? (
          <Text style={styles.state}>For you</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: 22, flex: 1, minWidth: 0, overflow: 'hidden' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  visual: { alignItems: 'center', height: 128, justifyContent: 'center', position: 'relative' },
  platformMark: { color: colors.ink, fontFamily: fonts.display, fontSize: 33, fontWeight: '700' },
  platform: { bottom: 12, color: 'rgba(23,23,19,0.68)', fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, position: 'absolute', textTransform: 'uppercase' },
  copy: { minHeight: 132, paddingHorizontal: 14, paddingVertical: 15 },
  topic: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: '700', lineHeight: 21, marginTop: 7 },
  state: { color: colors.success, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', marginTop: 'auto', paddingTop: 12 },
  waiting: { color: colors.muted },
});
