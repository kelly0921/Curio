import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/curio-theme';

export function CurioBrand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.lockup}>
      <View style={[styles.mark, compact && styles.compactMark]} accessibilityElementsHidden>
        <View style={[styles.petal, styles.petalOne]} />
        <View style={[styles.petal, styles.petalTwo]} />
        <View style={[styles.petal, styles.petalThree]} />
      </View>
      <View>
        <Text style={[styles.name, compact && styles.compactName]}>Curio</Text>
        {!compact && <Text style={styles.tagline}>Keep what sparks you.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  mark: { height: 38, position: 'relative', width: 38 },
  compactMark: { height: 30, transform: [{ scale: 0.78 }], width: 30 },
  petal: { borderRadius: 14, height: 22, position: 'absolute', width: 14 },
  petalOne: { backgroundColor: colors.peach, left: 2, top: 8, transform: [{ rotate: '-28deg' }] },
  petalTwo: { backgroundColor: colors.sky, left: 13, top: 1, transform: [{ rotate: '5deg' }] },
  petalThree: { backgroundColor: colors.sage, left: 21, top: 13, transform: [{ rotate: '38deg' }] },
  name: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  compactName: { fontSize: 23 },
  tagline: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.2, marginTop: -2 },
});
