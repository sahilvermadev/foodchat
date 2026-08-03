import { createHmac } from 'crypto';
import { createVoiceSessionGrant, getVoiceSessionConfiguration } from './voice';

const configuredEnvironment = {
  REKKY_VOICE_CONNECT_URL: 'wss://voice.rekky.ai/v1/realtime',
  REKKY_VOICE_JWT_AUDIENCE: 'rekky-voice',
  REKKY_VOICE_JWT_ISSUER: 'rekky-api',
  REKKY_VOICE_JWT_KEY_ID: 'rekky-voice-2026-08',
  REKKY_VOICE_JWT_SECRET: 'private-secret-that-is-at-least-32-characters',
};

const grantOptions = {
  audience: 'rekky-voice',
  connectUrl: 'wss://voice.rekky.ai/v1/realtime',
  issuer: 'rekky-api',
  keyId: 'rekky-voice-2026-08',
  secret: 'test-secret-that-is-at-least-32-characters',
  userId: 'user-123',
};

describe('cooking voice sessions', () => {
  test('stays disabled unless the private endpoint and signing secret are configured', () => {
    expect(
      getVoiceSessionConfiguration({
        REKKY_VOICE_CONNECT_URL: 'wss://voice.rekky.ai/v1/realtime',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
  });

  test('does not activate the retired Modal configuration', () => {
    expect(
      getVoiceSessionConfiguration({
        REKKY_VOICE_TOKEN_SECRET: 'private-secret-that-is-at-least-32-characters',
        REKKY_VOICE_URL: 'https://example--rekky-voice.modal.run',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
  });

  test('fails closed for weak secrets and insecure production endpoints', () => {
    expect(
      getVoiceSessionConfiguration({
        ...configuredEnvironment,
        REKKY_VOICE_CONNECT_URL: 'ws://voice.rekky.ai/v1/realtime',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
    expect(
      getVoiceSessionConfiguration({
        ...configuredEnvironment,
        REKKY_VOICE_JWT_SECRET: 'too-short',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
  });

  test('exposes only the authenticated Rekky session route to clients', () => {
    expect(
      getVoiceSessionConfiguration({
        ...configuredEnvironment,
        REKKY_VOICE_SHARE_RECIPE_CONTEXT: 'true',
      }),
    ).toEqual({
      enabled: true,
      sessionUrl: '/api/cooking/voice/session',
      shareRecipeContext: true,
    });
  });

  test('creates a short-lived signed websocket grant for the authenticated user', () => {
    const grant = createVoiceSessionGrant({
      ...grantOptions,
      now: new Date('2026-07-22T10:00:00.000Z'),
      ttlSeconds: 60,
    });
    const url = new URL(grant.connect_url);
    const token = grant.token;
    expect(grant.connect_url).toBe('wss://voice.rekky.ai/v1/realtime');
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/v1/realtime');
    expect(url.search).toBe('');
    expect(grant.token.split('.')).toHaveLength(3);
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'HS256',
      kid: 'rekky-voice-2026-08',
      typ: 'JWT',
    });
    expect(signature).toBe(
      createHmac('sha256', 'test-secret-that-is-at-least-32-characters')
        .update(`${header}.${payload}`)
        .digest('base64url'),
    );
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual(
      expect.objectContaining({
        aud: 'rekky-voice',
        exp: 1784714460,
        iat: 1784714400,
        iss: 'rekky-api',
        sub: 'user-123',
      }),
    );
    expect(grant.expires_at).toBe('2026-07-22T10:01:00.000Z');
  });

  test('creates a unique one-time grant identifier for every connection', () => {
    const options = {
      ...grantOptions,
      now: new Date('2026-07-22T10:00:00.000Z'),
    };
    const first = createVoiceSessionGrant(options);
    const second = createVoiceSessionGrant(options);
    const firstPayload = JSON.parse(Buffer.from(first.token.split('.')[1], 'base64url').toString());
    const secondPayload = JSON.parse(
      Buffer.from(second.token.split('.')[1], 'base64url').toString(),
    );

    expect(firstPayload.jti).toEqual(expect.any(String));
    expect(secondPayload.jti).toEqual(expect.any(String));
    expect(firstPayload.jti).not.toBe(secondPayload.jti);
  });
});
