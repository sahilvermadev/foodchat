import { createHmac, randomUUID } from 'crypto';

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
  audience: string;
  connectUrl: string;
  issuer: string;
  keyId: string;
  now?: Date;
  secret: string;
  ttlSeconds?: number;
  userId: string;
};

function encodeJson(value: Record<string, number | string>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function voiceWebSocketUrl(connectUrl: string): URL {
  const url = new URL(connectUrl);
  if (url.protocol !== 'wss:') {
    throw new Error('REKKY_VOICE_CONNECT_URL must use wss.');
  }
  return url;
}

export function getVoiceSessionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): VoiceSessionConfiguration {
  const connectUrl = environment.REKKY_VOICE_CONNECT_URL?.trim();
  const secret = environment.REKKY_VOICE_JWT_SECRET?.trim();
  const issuer = environment.REKKY_VOICE_JWT_ISSUER?.trim();
  const audience = environment.REKKY_VOICE_JWT_AUDIENCE?.trim();
  const keyId = environment.REKKY_VOICE_JWT_KEY_ID?.trim();
  let validEndpoint = false;
  if (connectUrl) {
    try {
      validEndpoint = voiceWebSocketUrl(connectUrl).protocol === 'wss:';
    } catch {
      validEndpoint = false;
    }
  }
  const enabled =
    validEndpoint &&
    Boolean(secret && secret.length >= 32 && issuer && audience && keyId && !/\s/.test(keyId));
  return {
    enabled,
    ...(enabled ? { sessionUrl: '/api/cooking/voice/session' } : {}),
    shareRecipeContext: environment.REKKY_VOICE_SHARE_RECIPE_CONTEXT === 'true',
  };
}

export function createVoiceSessionGrant({
  audience,
  connectUrl,
  issuer,
  keyId,
  now = new Date(),
  secret,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  userId,
}: VoiceGrantOptions): VoiceSessionGrant {
  if (
    !audience.trim() ||
    !connectUrl.trim() ||
    !issuer.trim() ||
    !keyId.trim() ||
    !secret.trim() ||
    !userId.trim()
  ) {
    throw new Error('Voice connection, JWT configuration, and user ID are required.');
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
  const header = encodeJson({ alg: 'HS256', kid: keyId, typ: 'JWT' });
  const payload = encodeJson({
    aud: audience,
    exp: expiresAt,
    iat: issuedAt,
    iss: issuer,
    jti: randomUUID(),
    sub: userId,
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  const websocketUrl = voiceWebSocketUrl(connectUrl);
  return {
    connect_url: websocketUrl.toString(),
    expires_at: new Date(expiresAt * 1000).toISOString(),
    token: `${unsigned}.${signature}`,
  };
}
