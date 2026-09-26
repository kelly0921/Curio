import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/curio-theme';
import { PwaRuntime } from '@/components/pwa-runtime';
import { CurioAuthGate, CurioAuthProvider } from '@/lib/curio-auth';

export default function RootLayout() {
  return (
    <CurioAuthProvider>
      <Head>
        <title>Curio · Keep what sparks you</title>
        <meta
          name="description"
          content="Turn the useful things you save into clear, researched knowledge you can find again."
        />
      </Head>
      <CurioAuthGate>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: colors.canvas },
              headerShown: false,
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sources" />
            <Stack.Screen name="priorities" options={{ animation: 'fade' }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
            <Stack.Screen name="handle-share" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="processing/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="item/[id]" />
            <Stack.Screen name="resource/[id]" />
          </Stack>
        </SafeAreaProvider>
      </CurioAuthGate>
      <PwaRuntime />
    </CurioAuthProvider>
  );
}
