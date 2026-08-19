import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/constants/curio-theme';
import { getSourceCoverImageSource, type KnowledgeResource } from '@/lib/curio-api';

const tileColors = [colors.peach, colors.sage, colors.sky, colors.lilac, colors.butter] as const;

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function resourceMark(resource: KnowledgeResource): string {
  if (resource.resourceType === 'glossary') return 'Aa';
  if (resource.resourceType === 'playbook') return '→';
  if (resource.resourceType === 'watchlist') return '◎';
  return '≡';
}

function purposeLabel(resource: KnowledgeResource): string {
  if (resource.intent === 'try') return 'Ready to try';
  if (resource.intent === 'visit') return 'Plan with this';
  if (resource.intent === 'buy') return 'Before buying';
  if (resource.intent === 'track') return 'Worth watching';
  if (resource.intent === 'compare') return 'Compare options';
  if (resource.intent === 'reference') return 'Keep for reference';
  return 'Understand';
}

function updatedLabel(updatedAt: string): string {
  const value = new Date(updatedAt);
  const today = new Date();
  const days = Math.max(0, Math.floor((today.getTime() - value.getTime()) / 86_400_000));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function ResourceTile({ resource, index, onPress }: { resource: KnowledgeResource; index: number; onPress: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const coverSource = resource.coverSourceItemId && !imageFailed
    ? getSourceCoverImageSource(resource.coverSourceItemId)
    : null;
  return (
    <Pressable
      accessibilityHint="Open this living resource"
      accessibilityLabel={resource.title}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, shadows.card, pressed && styles.pressed]}>
      <View style={[styles.visual, { backgroundColor: tileColors[index % tileColors.length] }]}>
        {coverSource ? (
          <>
            <Image
              accessibilityLabel="Frame from the original source"
              cachePolicy="memory-disk"
              contentFit="cover"
              onError={() => setImageFailed(true)}
              source={coverSource}
              style={styles.cover}
              transition={180}
            />
            <View pointerEvents="none" style={styles.coverShade} />
          </>
        ) : (
          <Text style={styles.mark}>{resourceMark(resource)}</Text>
        )}
        <View style={[styles.typeBadge, coverSource && styles.typeBadgeOnCover]}>
          <Text style={[styles.type, coverSource && styles.typeOnCover]}>{purposeLabel(resource)}</Text>
        </View>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.domain}>{label(resource.domain)} · {label(resource.resourceType)}</Text>
        <Text numberOfLines={3} style={styles.title}>{resource.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{resource.sourceItemIds.length} source{resource.sourceItemIds.length === 1 ? '' : 's'}</Text>
          <Text numberOfLines={1} style={styles.updated}>{updatedLabel(resource.updatedAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: 22, flex: 1, minWidth: 0, overflow: 'hidden' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  visual: { alignItems: 'center', height: 150, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  cover: { ...StyleSheet.absoluteFillObject },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,18,15,0.08)' },
  mark: { color: colors.ink, fontFamily: fonts.display, fontSize: 32, fontWeight: '700' },
  typeBadge: { backgroundColor: 'rgba(255,252,246,0.58)', borderRadius: 10, bottom: 10, left: 10, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute' },
  typeBadgeOnCover: { backgroundColor: 'rgba(23,23,19,0.78)' },
  type: { color: 'rgba(23,23,19,0.72)', fontFamily: fonts.body, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  typeOnCover: { color: colors.surface },
  copy: { minHeight: 138, paddingHorizontal: 14, paddingVertical: 15 },
  domain: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: '700', lineHeight: 21, marginTop: 7 },
  metaRow: { gap: 3, marginTop: 'auto', paddingTop: 12 },
  meta: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '800' },
  updated: { color: colors.muted, fontFamily: fonts.body, fontSize: 9 },
});
