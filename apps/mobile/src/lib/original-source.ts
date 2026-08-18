export interface OriginalSourceLink {
  href: string;
  label: string;
  target: '_blank';
}

export function originalSourceLink(sourceUrl: string, platform: string): OriginalSourceLink {
  if (platform !== 'instagram') return { href: sourceUrl, label: 'Open original source', target: '_blank' };

  try {
    const url = new URL(sourceUrl);
    url.protocol = 'https:';
    url.hostname = 'www.instagram.com';
    url.port = '';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';

    const mediaPath = url.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)/u);
    if (mediaPath) {
      const mediaType = mediaPath[1] === 'reels' ? 'reel' : mediaPath[1];
      url.pathname = `/${mediaType}/${mediaPath[2]}/`;
      return {
        href: url.toString(),
        label: mediaType === 'p' ? 'Open original post' : 'Open original Reel',
        target: '_blank',
      };
    }

    if (url.pathname !== '/') url.pathname = `${url.pathname.replace(/\/+$/u, '')}/`;
    return { href: url.toString(), label: 'Open original source', target: '_blank' };
  } catch {
    return { href: sourceUrl, label: 'Open original source', target: '_blank' };
  }
}
