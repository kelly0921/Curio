import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/curio-theme';

export default function AuthCallbackScreen() {
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.copy}>Signing you in to Curio…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', backgroundColor: colors.canvas, flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
});
