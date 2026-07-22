import { Image, type ImageProps } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/provider';
import { apiUrl, authenticatedApiResponse } from '@/lib/api/client';
import { authenticatedImageSource } from './media';

let imageAuthenticationRecovery: Promise<boolean> | null = null;
let imageAuthenticationRecoveryFailedAt = 0;
const RECOVERY_FAILURE_COOLDOWN_MS = 30_000;

function isProtectedApiImage(path: string) {
  return path.startsWith('/') || path.startsWith(`${apiUrl}/`);
}

function apiPath(path: string) {
  return path.startsWith(apiUrl) ? path.slice(apiUrl.length) : path;
}

async function recoverImageAuthentication(path: string) {
  if (Date.now() - imageAuthenticationRecoveryFailedAt < RECOVERY_FAILURE_COOLDOWN_MS) {
    return false;
  }

  imageAuthenticationRecovery ??= authenticatedApiResponse(apiPath(path), {
    method: 'HEAD',
  })
    .then(() => {
      imageAuthenticationRecoveryFailedAt = 0;
      return true;
    })
    .catch(() => {
      imageAuthenticationRecoveryFailedAt = Date.now();
      return false;
    })
    .finally(() => {
      imageAuthenticationRecovery = null;
    });

  return imageAuthenticationRecovery;
}

type AuthenticatedImageProps = Omit<ImageProps, 'source'> & {
  path?: string;
};

/** Native image requests need an explicit bridge into the API client's 401 refresh flow. */
export function AuthenticatedImage({ onError, path, ...props }: AuthenticatedImageProps) {
  const { credentialVersion } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const recoveryAttempted = useRef(false);

  useEffect(() => {
    recoveryAttempted.current = false;
    setAttempt(0);
  }, [path]);

  const handleError = useCallback<NonNullable<ImageProps['onError']>>(
    (event) => {
      onError?.(event);
      if (!path || recoveryAttempted.current || !isProtectedApiImage(path)) return;

      recoveryAttempted.current = true;
      void recoverImageAuthentication(path).then((recovered) => {
        if (recovered) setAttempt((current) => current + 1);
      });
    },
    [onError, path],
  );

  return (
    <Image
      key={`${path ?? 'empty'}:${credentialVersion}:${attempt}`}
      {...props}
      onError={handleError}
      recyclingKey={`${path ?? 'empty'}:credentials-${credentialVersion}:attempt-${attempt}`}
      source={authenticatedImageSource(path)}
    />
  );
}
