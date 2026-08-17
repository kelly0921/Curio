import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/curio-theme';

export function CurioBottomBar({ active = 'saved' }: { active?: 'saved' | 'priorities' }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: active === 'saved' }} onPress={() => router.replace('/')} style={styles.tab}>
        <Text style={active === 'saved' ? styles.activeIcon : styles.icon}>⌂</Text>
        <Text style={active === 'saved' ? styles.activeLabel : styles.label}>Saved</Text>
      </Pressable>
      <Pressable accessibilityLabel="Add to Curio" onPress={() => router.push('/capture')} style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
        <Text style={styles.addIcon}>＋</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'priorities' }}
        onPress={() => router.replace('/priorities')}
        style={styles.tab}>
        <Text style={active === 'priorities' ? styles.activeIcon : styles.icon}>✦</Text>
        <Text style={active === 'priorities' ? styles.activeLabel : styles.label}>For you</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-around', minHeight: 68, paddingTop: 8 },
  tab: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'center' },
  icon: { color: colors.muted, fontSize: 22 },
  activeIcon: { color: colors.ink, fontSize: 22 },
  label: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '600' },
  activeLabel: { color: colors.ink, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  add: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 27, height: 54, justifyContent: 'center', marginTop: -26, width: 54 },
  addIcon: { color: colors.surface, fontFamily: fonts.body, fontSize: 26, lineHeight: 29 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});
