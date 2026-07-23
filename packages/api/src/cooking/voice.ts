import { createHash, createHmac, randomUUID } from 'crypto';

const DEFAULT_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 300;

export type VoiceSessionConfiguration = {
  enabled: boolean;
  sessionUrl?: string;
  shareRecipeContext: boolean;
};

export type VoiceSessionGrant = {
  connect_url: string;
  expires_at: string;
  token: string;
};

type VoiceGrantOptions = {
  endpoint: string;
  now?: Date;
  secret: string;
  ttlSeconds?: number;
  userId: string;
};

function encodeJson(value: Record<string, number | string>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signingKeyId(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

function voiceWebSocketUrl(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
    throw new Error('REKKY_VOICE_URL must use https, http, wss, or ws.');
  }
  if (url.pathname === '' || url.pathname === '/') url.pathname = '/v1/realtime';
  return url;
}

export function getVoiceSessionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): VoiceSessionConfiguration {
  const endpoint = environment.REKKY_VOICE_URL?.trim();
  const secret = environment.REKKY_VOICE_TOKEN_SECRET?.trim();
  let validEndpoint = false;
  if (endpoint) {
    try {
      const url = voiceWebSocketUrl(endpoint);
      validEndpoint =
        url.protocol === 'wss:' ||
        (environment.NODE_ENV !== 'production' && url.protocol === 'ws:');
    } catch {
      validEndpoint = false;
    }
  }
  const enabled = validEndpoint && Boolean(secret && secret.length >= 32);
  return {
    enabled,
    ...(enabled ? { sessionUrl: '/api/cooking/voice/session' } : {}),
    shareRecipeContext: environment.REKKY_VOICE_SHARE_RECIPE_CONTEXT === 'true',
  };
}

export function createVoiceSessionGrant({
  endpoint,
  now = new Date(),
  secret,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  userId,
}: VoiceGrantOptions): VoiceSessionGrant {
  if (!endpoint.trim() || !secret.trim() || !userId.trim()) {
    throw new Error('Voice endpoint, signing secret, and user ID are required.');
  }
  if (secret.trim().length < 32) {
    throw new Error('Voice signing secret must contain at least 32 characters.');
  }
  const effectiveTtl = Math.min(
    MAX_TTL_SECONDS,
    Math.max(15, Number.isFinite(ttlSeconds) ? Math.floor(ttlSeconds) : DEFAULT_TTL_SECONDS),
  );
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + effectiveTtl;
  const header = encodeJson({ alg: 'HS256', kid: signingKeyId(secret), typ: 'JWT' });
  const payload = encodeJson({
    aud: 'rekky-voice',
    exp: expiresAt,
    iat: issuedAt,
    iss: 'rekky-api',
    jti: randomUUID(),
    sub: userId,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  const connectUrl = voiceWebSocketUrl(endpoint);
  return {
    connect_url: connectUrl.toString(),
    expires_at: new Date(expiresAt * 1000).toISOString(),
    token: `${unsigned}.${signature}`,
  };
}
