import { Platform } from 'react-native';

export const colors = {
  canvas: '#F6F2E8',
  surface: '#FFFCF6',
  ink: '#171713',
  muted: '#777267',
  line: '#DDD7CA',
  peach: '#EAAE87',
  sage: '#AFC7A6',
  sky: '#AFC6D9',
  lilac: '#C8B9D7',
  butter: '#E2CF88',
  dark: '#24251F',
  danger: '#A84D43',
  success: '#4C7250',
} as const;

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
} as const;

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: '#342D22', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 8px 24px rgba(52, 45, 34, 0.10)' },
  }),
} as const;
