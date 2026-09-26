import 'react-native-url-polyfill/auto';

import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { getCurioApiUrl } from '@/lib/curio-api';

export const authClient = createAuthClient({
  baseURL: getCurioApiUrl(),
  plugins: [
    expoClient({
      scheme: 'curio',
      storagePrefix: 'curio',
      cookiePrefix: 'curio',
      storage: SecureStore,
    }),
  ],
});
