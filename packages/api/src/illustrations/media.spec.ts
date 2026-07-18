import { fetch as undiciFetch } from 'undici';
import { resolveHostnameSSRF } from '../auth';
import { fetchRemoteImage } from './media';

jest.mock('undici', () => ({
  Agent: jest.fn(() => ({})),
  fetch: jest.fn(),
}));

jest.mock('../auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => ({ lookup: jest.fn() })),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

const fetchMock = undiciFetch as jest.MockedFunction<typeof undiciFetch>;
const resolveMock = resolveHostnameSSRF as jest.MockedFunction<typeof resolveHostnameSSRF>;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('fetchRemoteImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveMock.mockResolvedValue(false);
  });

  test('returns verified raster image bytes', async () => {
    fetchMock.mockResolvedValue(
      new Response(png, { headers: { 'content-type': 'image/png' } }) as never,
    );

    await expect(fetchRemoteImage('https://images.example/recipe.png')).resolves.toEqual({
      buffer: png,
      contentType: 'image/png',
    });
  });

  test('rejects a response before reading when content length exceeds the limit', async () => {
    fetchMock.mockResolvedValue(
      new Response(png, { headers: { 'content-length': '100' } }) as never,
    );

    await expect(
      fetchRemoteImage('https://images.example/recipe.png', { maxBytes: 10 }),
    ).rejects.toThrow('size limit');
  });

  test('validates redirect destinations before following them', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://metadata.internal/image.png' },
      }) as never,
    );
    resolveMock.mockImplementation(async (hostname) => hostname === 'metadata.internal');

    await expect(fetchRemoteImage('https://images.example/recipe.png')).rejects.toThrow(
      'Private, local, or metadata',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
