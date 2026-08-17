import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/curio-theme';

export function InstagramSourceViewer({ onDismiss, sourceUrl }: { onDismiss: () => void; sourceUrl: string }) {
  useEffect(() => {
    let active = true;
    void WebBrowser.openBrowserAsync(sourceUrl).finally(() => {
      if (active) onDismiss();
    });
    return () => {
      active = false;
    };
  }, [onDismiss, sourceUrl]);

  return (
    <View style={styles.opening}>
      <ActivityIndicator color={colors.ink} size="small" />
      <Text style={styles.openingText}>Opening the exact Reel…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  opening: { alignItems: 'center', flexDirection: 'row', gap: 9, paddingVertical: 14 },
  openingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, fontWeight: '700' },
});
