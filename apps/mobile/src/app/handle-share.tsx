import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { InstagramMediaDiscovery } from '@/components/instagram-media-discovery';
import { colors, fonts } from '@/constants/curio-theme';
import { CurioApiError, saveLink, saveSharedMedia } from '@/lib/curio-api';
import { type IncomingSharePayload, parseIncomingShare } from '@/lib/incoming-share';

interface IncomingShareState {
  clearSharedPayloads: () => void;
  error: Error | null;
  isResolving: boolean;
  resolvedSharedPayloads: IncomingSharePayload[];
  sharedPayloads: IncomingSharePayload[];
}

function useUnavailableIncomingShare(): IncomingShareState {
  return {
    clearSharedPayloads: () => undefined,
    error: new Error('Sharing directly into Curio requires a development build. Paste the link instead.'),
    isResolving: false,
    resolvedSharedPayloads: [],
    sharedPayloads: [],
  };
}

const useCurioIncomingShare = (
  Sharing as typeof Sharing & { useIncomingShare?: () => IncomingShareState }
).useIncomingShare ?? useUnavailableIncomingShare;

const progressCopy = ['Receiving your find', 'Checking the source', 'Finding the useful signal', 'Putting it in the right place'];

function isInstagramReel(value: string): boolean {
  try {
    const url = new URL(value);
    return ['instagram.com', 'www.instagram.com', 'instagr.am'].includes(url.hostname.toLowerCase())
      && /^\/(?:reel|reels)\/[A-Za-z0-9_-]+/u.test(url.pathname);
  } catch {
    return false;
  }
}

export default function HandleShareScreen() {
  const { clearSharedPayloads, error: shareError, isResolving, resolvedSharedPayloads, sharedPayloads } = useCurioIncomingShare();
  const [stage, setStage] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const started = useRef(false);
  const mediaUrls = useRef<string[]>([]);
  const incoming = useMemo(
    () => parseIncomingShare([...sharedPayloads, ...resolvedSharedPayloads]),
    [resolvedSharedPayloads, sharedPayloads],
  );

  useEffect(() => {
    const timer = setInterval(() => setStage((current) => Math.min(current + 1, progressCopy.length - 1)), 1_150);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isResolving || started.current || (!incoming.url && !incoming.media)) return;
    started.current = true;

    const operation = async () => {
      if (incoming.url && isInstagramReel(incoming.url) && mediaUrls.current.length === 0) {
        for (let attempt = 0; attempt < 20 && mediaUrls.current.length === 0; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (incoming.url && isInstagramReel(incoming.url) && mediaUrls.current.length) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
      return incoming.url
        ? saveLink(incoming.url, { context: incoming.context, publicMediaUrls: mediaUrls.current })
        : saveSharedMedia(incoming.media!);
    };

    void operation().then((result) => {
      clearSharedPayloads();
      const resourceId = result.resource?.id ?? result.item.resourceIds?.[0];
      router.replace(resourceId
        ? { pathname: '/resource/[id]', params: { id: resourceId } }
        : { pathname: '/item/[id]', params: { id: result.item.id } });
    }).catch((caught) => {
      setSaveError(caught instanceof CurioApiError ? caught.message : 'Curio could not finish this share.');
    });
  }, [clearSharedPayloads, incoming, isResolving, retryVersion]);

  const retryShare = () => {
    started.current = false;
    setStage(0);
    setSaveError(null);
    setRetryVersion((current) => current + 1);
  };

  const noSupportedPayload = !isResolving && !incoming.url && !incoming.media;
  const problem = saveError || shareError?.message || (noSupportedPayload ? 'Curio did not receive a link or supported video from this share.' : null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <InstagramMediaDiscovery
        onMediaUrls={(incomingUrls) => {
          mediaUrls.current = [...new Set([...mediaUrls.current, ...incomingUrls])].slice(0, 30);
        }}
        sourceUrl={incoming.url ?? ''}
      />
      <View style={styles.top}><CurioBrand compact /></View>
      <View style={styles.body}>
        {problem ? (
          <>
            <View style={[styles.signal, styles.problemSignal]}><Text style={styles.signalText}>!</Text></View>
            <Text style={styles.eyebrow}>SHARE INCOMPLETE</Text>
            <Text style={styles.title}>Keep the curiosity.{`\n`}Nothing was lost.</Text>
            <Text style={styles.copy}>{problem}</Text>
            {saveError ? (
              <>
                <Pressable onPress={retryShare} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Try this share again</Text><Text style={styles.primaryText}>↻</Text>
                </Pressable>
                <Pressable onPress={() => { clearSharedPayloads(); router.replace('/capture'); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Paste the link instead</Text></Pressable>
              </>
            ) : (
              <Pressable onPress={() => { clearSharedPayloads(); router.replace('/capture'); }} style={styles.primaryButton}>
                <Text style={styles.primaryText}>Paste the link</Text><Text style={styles.primaryText}>→</Text>
              </Pressable>
            )}
            <Pressable onPress={() => { clearSharedPayloads(); router.replace('/'); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Back to library</Text></Pressable>
          </>
        ) : (
          <>
            <View style={styles.signal}>
              <View style={[styles.pulse, styles.pulseOne]} />
              <View style={[styles.pulse, styles.pulseTwo]} />
              <Text style={styles.signalText}>✦</Text>
            </View>
            <Text style={styles.eyebrow}>SHARED TO CURIO</Text>
            <Text style={styles.title}>You’re done.{`\n`}Curio has it.</Text>
            <Text style={styles.copy}>No folders to choose and no form to fill out. We’ll preserve the source and organize the evidence it actually provides.</Text>
            <View style={styles.progressCard}>
              <ActivityIndicator color={colors.surface} />
              <View style={styles.progressCopy}><Text style={styles.progressTitle}>{progressCopy[stage]}</Text><Text style={styles.progressDetail}>Keep Curio open for this first prototype.</Text></View>
              <Text style={styles.progressCount}>{stage + 1}/4</Text>
            </View>
          </>
        )}
      </View>
      <Text style={styles.footer}>Curio never claims to watch content it could not access.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  top: { alignItems: 'center', paddingTop: 8 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 25 },
  signal: { alignItems: 'center', height: 96, justifyContent: 'center', marginBottom: 26, width: 96 },
  problemSignal: { backgroundColor: '#F3DFD4', borderRadius: 34 },
  pulse: { borderRadius: 28, height: 65, opacity: 0.68, position: 'absolute', width: 42 },
  pulseOne: { backgroundColor: colors.peach, left: 7, transform: [{ rotate: '-34deg' }] },
  pulseTwo: { backgroundColor: colors.sky, right: 7, transform: [{ rotate: '34deg' }] },
  signalText: { color: colors.ink, fontFamily: fonts.display, fontSize: 32, fontWeight: '700' },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 43, fontWeight: '700', letterSpacing: -2, lineHeight: 46, marginTop: 7 },
  copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 15, maxWidth: 340 },
  progressCard: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 20, flexDirection: 'row', gap: 14, marginTop: 28, minHeight: 76, paddingHorizontal: 17 },
  progressCopy: { flex: 1 },
  progressTitle: { color: colors.surface, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  progressDetail: { color: '#C8C5BB', fontFamily: fonts.body, fontSize: 10, marginTop: 3 },
  progressCount: { color: '#C8C5BB', fontFamily: fonts.body, fontSize: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 17, flexDirection: 'row', justifyContent: 'space-between', marginTop: 27, paddingHorizontal: 18, paddingVertical: 16 },
  primaryText: { color: colors.surface, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', paddingVertical: 18 },
  secondaryText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  footer: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, lineHeight: 14, paddingBottom: 18, paddingHorizontal: 35, textAlign: 'center' },
});
