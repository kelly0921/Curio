export interface IncomingSharePayload {
  value?: string | null;
  shareType?: string | null;
  mimeType?: string | null;
  contentUri?: string | null;
  contentType?: string | null;
  contentMimeType?: string | null;
  originalName?: string | null;
}

export interface CurioIncomingShare {
  url: string | null;
  context: string | null;
  media: { uri: string; name: string | null; mimeType: string | null } | null;
}

const urlPattern = /https?:\/\/[^\s<>"']+/giu;

function cleanUrl(value: string): string {
  return value.replace(/[),.;!?]+$/u, '');
}

export function parseIncomingShare(payloads: IncomingSharePayload[]): CurioIncomingShare {
  let url: string | null = null;
  let media: CurioIncomingShare['media'] = null;
  const contextParts: string[] = [];

  for (const payload of payloads) {
    const value = payload.value?.trim() ?? '';
    const matchedUrl = value.match(urlPattern)?.[0];
    if (!url && matchedUrl) {
      url = cleanUrl(matchedUrl);
    }

    const remaining = matchedUrl ? value.replace(matchedUrl, '') : value;
    const normalizedContext = remaining.replace(/\s+/gu, ' ').trim();

    if (!url && payload.contentType === 'website' && payload.contentUri?.startsWith('http')) {
      url = payload.contentUri;
    }

    const isMedia = ['video', 'audio'].includes(payload.contentType ?? payload.shareType ?? '');
    const mediaUri = payload.contentUri || (isMedia ? value : null);
    if (!media && isMedia && mediaUri) {
      media = {
        uri: mediaUri,
        name: payload.originalName ?? null,
        mimeType: payload.contentMimeType ?? payload.mimeType ?? null,
      };
    }

    const looksLikeFileReference = /^(?:content|file):\/\//iu.test(normalizedContext);
    if (!isMedia && !looksLikeFileReference && normalizedContext.length >= 12) {
      contextParts.push(normalizedContext);
    }
  }

  const context = [...new Set(contextParts)].slice(0, 3).join('\n').slice(0, 4_000) || null;
  return { url, context, media };
}
