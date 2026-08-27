export type AuthCallbackPayload =
  | { kind: 'code'; code: string }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

function parameters(url: URL): URLSearchParams[] {
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  return [url.searchParams, new URLSearchParams(fragment)];
}

function firstParameter(parameterSets: URLSearchParams[], name: string): string | null {
  for (const set of parameterSets) {
    const value = set.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function isCurioAuthCallback(url: URL): boolean {
  const normalizedPath = `${url.host}/${url.pathname}`
    .replace(/\/{2,}/gu, '/')
    .replace(/^\/+|\/+$/gu, '')
    .toLowerCase();
  return normalizedPath.endsWith('auth/callback');
}

export function parseAuthCallback(rawUrl: string): AuthCallbackPayload {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'none' };
  }
  if (!isCurioAuthCallback(url)) return { kind: 'none' };

  const parameterSets = parameters(url);
  const errorDescription = firstParameter(parameterSets, 'error_description')
    ?? firstParameter(parameterSets, 'error');
  if (errorDescription) return { kind: 'error', message: errorDescription };

  const code = firstParameter(parameterSets, 'code');
  if (code) return { kind: 'code', code };

  const accessToken = firstParameter(parameterSets, 'access_token');
  const refreshToken = firstParameter(parameterSets, 'refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };

  return { kind: 'none' };
}
