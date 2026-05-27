import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { ImgHTMLAttributes, ReactNode } from 'react';

type ProtectedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string;
  fallback?: ReactNode;
};

function needsAuthenticatedFetch(src: string): boolean {
  try {
    const pathname = new URL(src, window.location.origin).pathname;
    return (
      /^\/api\/recipes\/[^/]+\/illustration$/.test(pathname) ||
      /^\/api\/preferences\/ingredients\/[^/]+\/image$/.test(pathname)
    );
  } catch {
    return false;
  }
}

function AuthenticatedImage({
  src,
  fallback,
  ...props
}: Omit<ProtectedImageProps, 'src'> & { src: string }) {
  const imageQuery = useQuery<Blob | undefined>(
    [QueryKeys.protectedImage, src],
    async () => {
      const response = await dataService.getProtectedImage(src);
      return response.data;
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      cacheTime: 60 * 60 * 1000,
    },
  );
  const objectUrl = useMemo(
    () => (imageQuery.data ? window.URL.createObjectURL(imageQuery.data) : undefined),
    [imageQuery.data],
  );

  useEffect(
    () => () => {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    },
    [objectUrl],
  );

  return objectUrl ? <img {...props} src={objectUrl} /> : <>{fallback}</>;
}

export default function ProtectedImage({ src, fallback = null, ...props }: ProtectedImageProps) {
  if (!src) {
    return <>{fallback}</>;
  }

  if (needsAuthenticatedFetch(src)) {
    return <AuthenticatedImage {...props} src={src} fallback={fallback} />;
  }

  return <img {...props} src={src} />;
}
