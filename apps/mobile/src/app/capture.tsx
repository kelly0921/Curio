import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurioBrand } from '@/components/curio-brand';
import { InstagramMediaDiscovery } from '@/components/instagram-media-discovery';
import { colors, fonts } from '@/constants/curio-theme';
import { CurioApiError, saveDemo, saveLink } from '@/lib/curio-api';

const stages = ['Saving the source', 'Reading what is available', 'Finding the useful signal', 'Organizing your Curio'];

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isInstagramReel(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ['instagram.com', 'www.instagram.com', 'instagr.am'].includes(url.hostname.toLowerCase())
      && /^\/(?:reel|reels)\/[A-Za-z0-9_-]+/u.test(url.pathname);
  } catch {
    return false;
  }
}

export default function CaptureScreen() {
  const [url, setUrl] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaUrls = useRef<string[]>([]);

  useEffect(() => {
    if (!saving) return;
    const timer = setInterval(() => setStage((current) => Math.min(current + 1, stages.length - 1)), 1_200);
    return () => clearInterval(timer);
  }, [saving]);

  async function submit() {
    if (!validHttpsUrl(url.trim())) {
      setError('Paste a complete HTTPS link from Instagram, TikTok, YouTube, or the web.');
      return;
    }
    setSaving(true);
    setStage(0);
    setError(null);
    try {
      if (isInstagramReel(url) && mediaUrls.current.length === 0) {
        for (let attempt = 0; attempt < 20 && mediaUrls.current.length === 0; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (isInstagramReel(url) && mediaUrls.current.length) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
      const result = await saveLink(url, { context, publicMediaUrls: mediaUrls.current });
      const resourceId = result.resource?.id ?? result.item.resourceIds?.[0];
      router.replace(resourceId
        ? { pathname: '/resource/[id]', params: { id: resourceId } }
        : { pathname: '/item/[id]', params: { id: result.item.id } });
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not save this link.');
      setSaving(false);
    }
  }

  async function loadSample() {
    setSaving(true);
    setStage(1);
    setError(null);
    try {
      const result = await saveDemo();
      const resourceId = result.resource?.id ?? result.item.resourceIds?.[0];
      router.replace(resourceId
        ? { pathname: '/resource/[id]', params: { id: resourceId } }
        : { pathname: '/item/[id]', params: { id: result.item.id } });
    } catch (caught) {
      setError(caught instanceof CurioApiError ? caught.message : 'Curio could not load the sample.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <InstagramMediaDiscovery
        onMediaUrls={(incoming) => {
          mediaUrls.current = [...new Set([...mediaUrls.current, ...incoming])].slice(0, 30);
        }}
        sourceUrl={url}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topbar}>
            <CurioBrand compact />
            <Pressable accessibilityLabel="Close" disabled={saving} onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>

          <View style={styles.heroMark}>
            <View style={[styles.orbit, styles.orbitOne]} />
            <View style={[styles.orbit, styles.orbitTwo]} />
            <Text style={styles.heroMarkText}>↗</Text>
          </View>
          <Text style={styles.eyebrow}>ADD TO CURIO</Text>
          <Text style={styles.title}>Save now.{`\n`}Find meaning later.</Text>
          <Text style={styles.intro}>Paste the link once. Curio will identify the platform, preserve the source, and organize whatever evidence is available.</Text>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>LINK</Text>
            <TextInput
              accessibilityLabel="Link to save"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!saving}
              keyboardType="url"
              onChangeText={(value) => {
                mediaUrls.current = [];
                setUrl(value);
              }}
              onSubmitEditing={() => void submit()}
              placeholder="https://instagram.com/reel/…"
              placeholderTextColor="#999286"
              returnKeyType="go"
              style={styles.input}
              value={url}
            />

            {!showContext ? (
              <Pressable disabled={saving} onPress={() => setShowContext(true)} style={styles.contextToggle}>
                <Text style={styles.contextToggleText}>Private link or extra context?</Text><Text style={styles.contextToggleAction}>Add details ＋</Text>
              </Pressable>
            ) : (
              <View style={styles.contextArea}>
                <Text style={styles.fieldLabel}>OPTIONAL CAPTION OR NOTE</Text>
                <TextInput
                  accessibilityLabel="Optional source context"
                  editable={!saving}
                  multiline
                  onChangeText={setContext}
                  placeholder="Paste a caption or transcript only when the source is restricted."
                  placeholderTextColor="#999286"
                  style={styles.contextInput}
                  textAlignVertical="top"
                  value={context}
                />
              </View>
            )}

            {saving ? (
              <View style={styles.progress}>
                <ActivityIndicator color={colors.surface} />
                <View><Text style={styles.progressTitle}>{stages[stage]}</Text><Text style={styles.progressCopy}>This usually takes a few seconds.</Text></View>
              </View>
            ) : (
              <Pressable onPress={() => void submit()} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
                <Text style={styles.saveButtonText}>Save to Curio</Text><Text style={styles.saveArrow}>→</Text>
              </Pressable>
            )}

            {error && <View style={styles.error}><Text style={styles.errorTitle}>Couldn’t save this yet</Text><Text style={styles.errorCopy}>{error}</Text></View>}
          </View>

          <View style={styles.shareHint}>
            <Text style={styles.shareHintIcon}>⇧</Text>
            <View style={styles.shareHintCopy}><Text style={styles.shareHintTitle}>Even faster from Instagram or TikTok</Text><Text style={styles.shareHintBody}>Tap Share on the post, then choose Curio. No copying once your development build is installed.</Text></View>
          </View>

          <Pressable disabled={saving} onPress={() => void loadSample()} style={styles.sampleButton}>
            <Text style={styles.sampleButtonText}>No link handy? Try a processed example</Text>
          </Pressable>
          <Text style={styles.provenance}>Curio only analyzes source material it can actually access. Restricted links stay saved without an invented summary.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  content: { paddingBottom: 30, paddingHorizontal: 20 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 28, paddingTop: 8 },
  close: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  closeText: { color: colors.ink, fontFamily: fonts.body, fontSize: 24, lineHeight: 27 },
  heroMark: { alignItems: 'center', height: 72, justifyContent: 'center', marginBottom: 20, width: 72 },
  orbit: { borderRadius: 20, height: 44, opacity: 0.72, position: 'absolute', width: 28 },
  orbitOne: { backgroundColor: colors.peach, left: 8, transform: [{ rotate: '-35deg' }] },
  orbitTwo: { backgroundColor: colors.sky, right: 8, transform: [{ rotate: '35deg' }] },
  heroMarkText: { color: colors.ink, fontSize: 25, fontWeight: '700' },
  eyebrow: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 42, fontWeight: '700', letterSpacing: -1.8, lineHeight: 44, marginTop: 6 },
  intro: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 12, maxWidth: 340 },
  formCard: { backgroundColor: colors.surface, borderRadius: 24, marginTop: 28, padding: 17 },
  fieldLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 7 },
  input: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 15, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 14, minHeight: 53, paddingHorizontal: 14 },
  contextToggle: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingVertical: 15 },
  contextToggleText: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  contextToggleAction: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800' },
  contextArea: { marginTop: 16 },
  contextInput: { backgroundColor: colors.canvas, borderColor: colors.line, borderRadius: 15, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 13, minHeight: 100, padding: 13 },
  saveButton: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, minHeight: 54, paddingHorizontal: 18 },
  saveButtonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 14, fontWeight: '800' },
  saveArrow: { color: colors.surface, fontSize: 20 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  progress: { alignItems: 'center', backgroundColor: colors.dark, borderRadius: 16, flexDirection: 'row', gap: 13, marginTop: 4, minHeight: 62, paddingHorizontal: 17 },
  progressTitle: { color: colors.surface, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  progressCopy: { color: '#C9C7BE', fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  error: { backgroundColor: '#F3DFD4', borderRadius: 14, marginTop: 12, padding: 13 },
  errorTitle: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
  errorCopy: { color: '#735C51', fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  shareHint: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 15, marginTop: 27, paddingBottom: 24, paddingHorizontal: 5 },
  shareHintIcon: { color: colors.ink, fontSize: 26 },
  shareHintCopy: { flex: 1 },
  shareHintTitle: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '800' },
  shareHintBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  sampleButton: { alignItems: 'center', paddingVertical: 19 },
  sampleButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  provenance: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, paddingHorizontal: 18, textAlign: 'center' },
});
