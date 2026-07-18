import sharp from 'sharp';
import { Agent, fetch as undiciFetch } from 'undici';

import { isSSRFTarget, resolveHostnameSSRF, createSSRFSafeUndiciConnect } from '../auth';

export type IllustrationMedia = {
  buffer: Buffer;
  contentType: string;
};

const imageDataUrlPattern = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-zA-Z0-9+/=\s]+)$/;
const thumbnailWidth = 480;
const defaultMaxRemoteImageBytes = 5 * 1024 * 1024;
const defaultRemoteImageTimeoutMs = 5_000;
const maxRemoteImageRedirects = 3;
const remoteImageAgent = new Agent({ connect: createSSRFSafeUndiciConnect() });
const supportedRemoteImageTypes = new Map([
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['avif', 'image/avif'],
]);

export type RemoteImageOptions = {
  allowedHosts?: string[];
  maxBytes?: number;
  timeoutMs?: number;
};

function normalizedRemoteImageUrl(value: string, allowedHosts?: string[]): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Remote image URL is not allowed.');
  }
  if (allowedHosts?.length) {
    const hostname = url.hostname.toLowerCase();
    const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (!allowed) {
      throw new Error('Remote image host is not allowed.');
    }
  }
  return url;
}

async function assertRemoteImageUrl(value: string, allowedHosts?: string[]): Promise<URL> {
  const url = normalizedRemoteImageUrl(value, allowedHosts);
  if (isSSRFTarget(url.hostname) || (await resolveHostnameSSRF(url.hostname))) {
    throw new Error('Private, local, or metadata image URLs are not allowed.');
  }
  return url;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    throw new Error('Remote image exceeds the size limit.');
  }
  if (!response.body) {
    throw new Error('Remote image returned an empty response.');
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) {
      throw new Error('Remote image exceeds the size limit.');
    }
    chunks.push(Buffer.from(chunk));
  }
  if (bytes === 0) {
    throw new Error('Remote image returned an empty response.');
  }
  return Buffer.concat(chunks, bytes);
}

export async function fetchRemoteImage(
  value: string,
  options: RemoteImageOptions = {},
  redirects = 0,
): Promise<IllustrationMedia> {
  const maxBytes = options.maxBytes ?? defaultMaxRemoteImageBytes;
  const timeoutMs = options.timeoutMs ?? defaultRemoteImageTimeoutMs;
  const url = await assertRemoteImageUrl(value, options.allowedHosts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await undiciFetch(url, {
      dispatcher: remoteImageAgent,
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRemoteImageRedirects) {
        throw new Error('Remote image redirected too many times.');
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Remote image redirect is missing a location.');
      }
      const redirectedUrl = new URL(location, url).toString();
      await assertRemoteImageUrl(redirectedUrl, options.allowedHosts);
      return fetchRemoteImage(redirectedUrl, options, redirects + 1);
    }
    if (!response.ok) {
      throw new Error(`Remote image request failed with ${response.status}.`);
    }

    const buffer = await readBoundedBody(response as unknown as Response, maxBytes);
    const metadata = await sharp(buffer, { animated: false }).metadata();
    const contentType = metadata.format
      ? supportedRemoteImageTypes.get(metadata.format)
      : undefined;
    if (!contentType) {
      throw new Error('Remote response is not a supported raster image.');
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export function decodeIllustrationDataUrl(dataUrl?: string): IllustrationMedia | null {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(imageDataUrlPattern);
  if (!match) {
    return null;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) {
    return null;
  }

  return {
    buffer,
    contentType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
  };
}

export async function createIllustrationThumbnail(
  media: IllustrationMedia,
): Promise<IllustrationMedia> {
  const buffer = await sharp(media.buffer)
    .rotate()
    .resize({ width: thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}
