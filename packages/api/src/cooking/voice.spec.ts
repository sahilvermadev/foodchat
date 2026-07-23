import { createHash, createHmac } from 'crypto';
import { createVoiceSessionGrant, getVoiceSessionConfiguration } from './voice';

describe('cooking voice sessions', () => {
  test('stays disabled unless the private endpoint and signing secret are configured', () => {
    expect(getVoiceSessionConfiguration({ REKKY_VOICE_URL: 'https://voice.example' })).toEqual({
      enabled: false,
      shareRecipeContext: false,
    });
  });

  test('fails closed for weak secrets and insecure production endpoints', () => {
    expect(
      getVoiceSessionConfiguration({
        NODE_ENV: 'production',
        REKKY_VOICE_TOKEN_SECRET: 'private-secret-that-is-at-least-32-characters',
        REKKY_VOICE_URL: 'http://voice.example',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
    expect(
      getVoiceSessionConfiguration({
        NODE_ENV: 'production',
        REKKY_VOICE_TOKEN_SECRET: 'too-short',
        REKKY_VOICE_URL: 'https://voice.example',
      }),
    ).toEqual({ enabled: false, shareRecipeContext: false });
  });

  test('exposes only the authenticated Rekky session route to clients', () => {
    expect(
      getVoiceSessionConfiguration({
        REKKY_VOICE_SHARE_RECIPE_CONTEXT: 'true',
        REKKY_VOICE_TOKEN_SECRET: 'private-secret-that-is-at-least-32-characters',
        REKKY_VOICE_URL: 'https://voice.example',
      }),
    ).toEqual({
      enabled: true,
      sessionUrl: '/api/cooking/voice/session',
      shareRecipeContext: true,
    });
  });

  test('creates a short-lived signed websocket grant for the authenticated user', () => {
    const grant = createVoiceSessionGrant({
      endpoint: 'https://voice.example',
      now: new Date('2026-07-22T10:00:00.000Z'),
      secret: 'test-secret-that-is-at-least-32-characters',
      ttlSeconds: 60,
      userId: 'user-123',
    });
    const url = new URL(grant.connect_url);
    const token = grant.token;
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/v1/realtime');
    expect(url.search).toBe('');
    expect(grant.token.split('.')).toHaveLength(3);
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'HS256',
      kid: createHash('sha256')
        .update('test-secret-that-is-at-least-32-characters')
        .digest('hex')
        .slice(0, 12),
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
});
