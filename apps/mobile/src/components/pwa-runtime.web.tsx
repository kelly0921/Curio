import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, shadows } from '@/constants/curio-theme';
import { useCurioAuth } from '@/lib/curio-auth';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Notice = 'install' | 'ios-install' | 'offline' | 'update' | null;

const INSTALL_DISMISS_KEY = 'curio:pwa-install-dismissed-at';
const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/iu.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installPromptWasRecentlyDismissed(): boolean {
  const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_DISMISS_MS;
}

export function PwaRuntime() {
  const { session } = useCurioAuth();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  // Keep the first client render identical to the statically rendered shell.
  // The real network state is synchronized after hydration.
  const [offline, setOffline] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const initialNetworkTimer = setTimeout(() => setOffline(!navigator.onLine), 0);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (!isStandalone() && !installPromptWasRecentlyDismissed()) {
        setInstallPrompt(event as BeforeInstallPromptEvent);
      }
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstall(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIosDevice() && !isStandalone() && !installPromptWasRecentlyDismissed()) {
      iosTimer = setTimeout(() => setShowIosInstall(true), 2400);
    }

    return () => {
      clearTimeout(initialNetworkTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return undefined;

    let active = true;
    let refreshing = false;
    let updateTimer: ReturnType<typeof setInterval> | null = null;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void navigator.serviceWorker.register('/sw.js').then((nextRegistration) => {
      if (!active) return;
      if (nextRegistration.waiting && navigator.serviceWorker.controller) {
        setUpdateRegistration(nextRegistration);
      }

      const watchInstallingWorker = () => {
        const installingWorker = nextRegistration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateRegistration(nextRegistration);
          }
        });
      };
      nextRegistration.addEventListener('updatefound', watchInstallingWorker);
      updateTimer = setInterval(() => void nextRegistration.update(), 60 * 60 * 1000);
    }).catch(() => {
      // Curio remains fully usable online when service worker registration is unavailable.
    });

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (updateTimer) clearInterval(updateTimer);
    };
  }, []);

  const dismissInstall = () => {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    setInstallPrompt(null);
    setShowIosInstall(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
    else dismissInstall();
  };

  const applyUpdate = () => {
    const waitingWorker = updateRegistration?.waiting;
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  };

  const notice: Notice = updateRegistration
    ? 'update'
    : offline
      ? 'offline'
      : session && installPrompt
        ? 'install'
        : session && showIosInstall
          ? 'ios-install'
          : null;

  if (!notice) return null;

  const title = notice === 'update'
    ? 'A fresher Curio is ready.'
    : notice === 'offline'
      ? 'Curio is offline.'
      : 'Keep Curio close.';
  const copy = notice === 'update'
    ? 'Refresh once to use the latest version.'
    : notice === 'offline'
      ? 'Saved pages may still open. New saves need a connection.'
      : notice === 'ios-install'
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Install the app for quicker access to your saves.';

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View accessibilityLiveRegion="polite" style={[styles.notice, shadows.card]}>
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{copy}</Text>
        </View>
        {notice === 'update' && (
          <Pressable accessibilityRole="button" onPress={applyUpdate} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </Pressable>
        )}
        {notice === 'install' && (
          <Pressable accessibilityRole="button" onPress={() => void install()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Install</Text>
          </Pressable>
        )}
        {notice === 'ios-install' && (
          <Pressable accessibilityRole="button" onPress={dismissInstall} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Got it</Text>
          </Pressable>
        )}
        {(notice === 'install' || notice === 'ios-install') && (
          <Pressable accessibilityLabel="Dismiss install suggestion" accessibilityRole="button" onPress={dismissInstall} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 92,
    paddingHorizontal: 18,
    zIndex: 1000,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    maxWidth: 460,
    minHeight: 72,
    paddingBottom: 14,
    paddingLeft: 17,
    paddingRight: 14,
    paddingTop: 14,
    position: 'relative',
    width: '100%',
  },
  copyBlock: { flex: 1 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 16, fontWeight: '700', lineHeight: 20 },
  copy: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  primaryButton: { backgroundColor: colors.dark, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  primaryButtonText: { color: colors.surface, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  secondaryButton: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  secondaryButtonText: { color: colors.ink, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  closeButton: { alignItems: 'center', height: 28, justifyContent: 'center', position: 'absolute', right: -8, top: -10, width: 28 },
  closeButtonText: { color: colors.muted, fontFamily: fonts.body, fontSize: 21, lineHeight: 24 },
});
