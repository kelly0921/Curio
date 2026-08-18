import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type WebViewMessageEvent, WebView } from 'react-native-webview';

interface InstagramMediaDiscoveryProps {
  onMediaUrls: (urls: string[]) => void;
  sourceUrl: string;
}

const discoveryScript = String.raw`
  (function () {
    if (window.__curioMediaDiscoveryStarted) return true;
    window.__curioMediaDiscoveryStarted = true;
    var attempts = 0;
    var collect = function () {
      try {
        var urls = [];
        performance.getEntriesByType('resource').forEach(function (entry) { urls.push(entry.name); });
        document.querySelectorAll('video, video source').forEach(function (element) {
          if (element.currentSrc) urls.push(element.currentSrc);
          if (element.src) urls.push(element.src);
        });
        var mediaUrls = Array.from(new Set(urls)).filter(function (value) {
          return typeof value === 'string'
            && value.indexOf('https://') === 0
            && /(cdninstagram\.com|fbcdn\.net)/i.test(value);
        }).slice(0, 30);
        if (mediaUrls.length) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'curio-instagram-media', mediaUrls: mediaUrls }));
        }
        var video = document.querySelector('video');
        if (video) {
          video.muted = true;
          video.setAttribute('playsinline', 'true');
          var playResult = video.play();
          if (playResult && playResult.catch) playResult.catch(function () {});
        }
      } catch (_) {}
      attempts += 1;
      if (attempts < 50) setTimeout(collect, 400);
    };
    setTimeout(collect, 250);
    return true;
  })();
  true;
`;

function publicEmbedUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl.trim());
    const hostname = url.hostname.toLowerCase();
    if (!['instagram.com', 'www.instagram.com', 'instagr.am'].includes(hostname)) return null;
    const match = url.pathname.match(/^\/(?:reel|reels)\/([A-Za-z0-9_-]+)/u);
    return match ? `https://www.instagram.com/reel/${match[1]}/embed/captioned/` : null;
  } catch {
    return null;
  }
}

export function InstagramMediaDiscovery({ onMediaUrls, sourceUrl }: InstagramMediaDiscoveryProps) {
  const embedUrl = useMemo(() => publicEmbedUrl(sourceUrl), [sourceUrl]);
  if (!embedUrl) return null;

  function receiveMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; mediaUrls?: unknown };
      if (message.type !== 'curio-instagram-media' || !Array.isArray(message.mediaUrls)) return;
      const urls = message.mediaUrls.filter((value): value is string => typeof value === 'string');
      if (urls.length) onMediaUrls(urls);
    } catch {
      // Instagram can emit unrelated WebView messages; ignore them.
    }
  }

  return (
    <View collapsable={false} pointerEvents="none" style={styles.hiddenContainer}>
      <WebView
        allowsInlineMediaPlayback
        containerStyle={styles.hiddenWebViewContainer}
        injectedJavaScript={discoveryScript}
        injectedJavaScriptBeforeContentLoaded={discoveryScript}
        javaScriptEnabled
        key={embedUrl}
        mediaPlaybackRequiresUserAction={false}
        onMessage={receiveMessage}
        onShouldStartLoadWithRequest={(request) => (
          request.url === 'about:blank'
          || /^https:\/\/([^.]+\.)?(instagram\.com|cdninstagram\.com|fbcdn\.net)(?:\/|$)/iu.test(request.url)
        )}
        originWhitelist={['https://*']}
        source={{ uri: embedUrl }}
        style={styles.hiddenWebView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenContainer: {
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 1,
  },
  hiddenWebViewContainer: { flex: 0, height: 1, width: 1 },
  hiddenWebView: { flex: 0, height: 1, width: 1 },
});
