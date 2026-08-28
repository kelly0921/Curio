import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { colors, fonts } from '@/constants/curio-theme';
import {
  CurioApiError,
  getProcessingJob,
  retryProcessingJob,
  type ProcessingJobReceipt,
} from '@/lib/curio-api';

function progress(job: ProcessingJobReceipt | null): { eyebrow: string; title: string; copy: string } {
  if (job?.status === 'failed') return {
    eyebrow: 'NEEDS ATTENTION',
    title: 'This one needs another try.',
    copy: job.error?.message ?? 'Curio could not finish processing this source.',
  };
  if (job?.status === 'processing') return {
    eyebrow: 'BUILDING YOUR CURIO',
    title: 'Finding what is worth keeping.',
    copy: 'Curio is reading the source, extracting its lessons, and checking useful claims. You can close the app—we’ll keep working.',
  };
  return {
    eyebrow: 'SAVED TO CURIO',
    title: 'Your source is in line.',
    copy: 'It is safely saved. You can close the app—we’ll keep processing it in the background.',
  };
}

export default function ProcessingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<ProcessingJobReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const navigated = useRef(false);

  const check = useCallback(async () => {
    if (!id || navigated.current) return;
    try {
      const result = await getProcessingJob(id);
      setJob(result.job);
      setError(null);
      if (result.job.status === 'ready' && result.job.itemId) {
        navigated.current = true;
        const resourceId = result.resource?.id ?? result.job.resourceId ?? result.item?.resourceIds?.[0];
        router.replace(resourceId
          ? { pathname: '/resource/[id]', params: { id: resourceId } }
          : { pathname: '/item/[id]', params: { id: result.job.itemId } });
      }
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not check this save.');
    }
  }, [id]);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 2_500);
    return () => clearInterval(timer);
  }, [check]);

  async function retry() {
    if (!id || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      setJob(await retryProcessingJob(id));
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not restart this save.');
    } finally {
      setRetrying(false);
    }
  }

  const state = progress(job);
  const canRetry = job?.status === 'failed' && job.error?.recoverable;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topbar}>
        <CurioBrand compact />
        <Pressable accessibilityLabel="Back to library" onPress={() => router.replace('/')} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={[styles.signal, job?.status === 'failed' && styles.signalFailed]}>
          {job?.status !== 'failed' && <ActivityIndicator color={colors.ink} size="large" />}
          {job?.status === 'failed' && <Text style={styles.signalText}>!</Text>}
        </View>
        <Text style={styles.eyebrow}>{state.eyebrow}</Text>
        <Text style={styles.title}>{state.title}</Text>
        <Text style={styles.copy}>{state.copy}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {canRetry && (
          <Pressable disabled={retrying} onPress={() => void retry()} style={styles.primaryButton}>
            {retrying ? <ActivityIndicator color={colors.surface} /> : <><Text style={styles.primaryText}>Try processing again</Text><Text style={styles.primaryText}>↻</Text></>}
          </Pressable>
        )}
        <Pressable onPress={() => router.replace('/')} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Back to library</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>Curio keeps source content private and never invents details it could not access.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 },
  close: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  closeText: { color: colors.ink, fontFamily: fonts.body, fontSize: 24, lineHeight: 27 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 25 },
  signal: { alignItems: 'center', backgroundColor: colors.butter, borderRadius: 35, height: 92, justifyContent: 'center', marginBottom: 26, width: 92 },
  signalFailed: { backgroundColor: '#F3DFD4' },
  signalText: { color: colors.danger, fontFamily: fonts.display, fontSize: 34, fontWeight: '700' },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 42, fontWeight: '700', letterSpacing: -1.8, lineHeight: 45, marginTop: 7, maxWidth: 350 },
  copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 15, maxWidth: 350 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 17, flexDirection: 'row', justifyContent: 'space-between', marginTop: 27, minHeight: 54, paddingHorizontal: 18 },
  primaryText: { color: colors.surface, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', paddingVertical: 19 },
  secondaryText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  footer: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, lineHeight: 14, paddingBottom: 18, paddingHorizontal: 35, textAlign: 'center' },
});
