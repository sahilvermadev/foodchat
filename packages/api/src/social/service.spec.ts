import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '@librechat/data-schemas';

import {
  createSocialImport,
  createDraftFromSocialImport,
  createSocialPlaylistSubscription,
  deleteSocialPlaylistSubscription,
  deleteSocialImport,
  getSocialImportThumbnail,
  listSocialImportJobs,
  listSocialImports,
  listSocialPlaylistSubscriptions,
  processSocialImportJob,
  syncSocialPlaylistSubscription,
  retrySocialImportProcessing,
  SocialImportValidationError,
  updateSocialPlaylistSubscription,
  updateSocialImport,
} from './service';
import { createIllustrationThumbnail, fetchRemoteImage } from '../illustrations/media';
import { setExperimentalYouTubeTranscriptFetcherForTest } from './transcript';

jest.mock('../illustrations/media', () => ({
  fetchRemoteImage: jest.fn(),
  createIllustrationThumbnail: jest.fn(async () => ({
    buffer: Buffer.from('persisted-thumbnail'),
    contentType: 'image/webp',
  })),
}));

jest.setTimeout(60000);

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  delete process.env.SOCIAL_IMPORT_ENABLE_WEB_EXTRACTION_IN_TEST;
  delete process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST;
  delete process.env.SOCIAL_IMPORT_AUTO_RUN_JOBS_IN_TEST;
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_TRANSCRIPT_ADAPTER;
  delete process.env.YOUTUBE_TRANSCRIPT_PER_USER_DAILY_LIMIT;
  delete process.env.YOUTUBE_TRANSCRIPT_GLOBAL_DAILY_LIMIT;
  setExperimentalYouTubeTranscriptFetcherForTest(undefined);
  jest.restoreAllMocks();
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('social import service', () => {
  test('returns incremental import changes and deletion tombstones', async () => {
    const socialImport = await createSocialImport('offline-import-user', {
      sourceUrl: 'https://example.com/recipes/soup',
      title: 'Soup',
    });
    const checkpoint = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await updateSocialImport('offline-import-user', socialImport._id, { status: 'inspiration' });

    const changed = await listSocialImports('offline-import-user', { since: checkpoint });
    expect(changed.imports).toEqual([
      expect.objectContaining({ _id: socialImport._id, status: 'inspiration' }),
    ]);

    const deletionCheckpoint = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await deleteSocialImport('offline-import-user', socialImport._id);
    const deleted = await listSocialImports('offline-import-user', {
      since: deletionCheckpoint,
    });
    expect(deleted.deletedIds).toContain(socialImport._id);
  });

  test('finishes a pending import deletion before returning an offline delta', async () => {
    const user = 'offline-pending-import-delete-user';
    const socialImport = await createSocialImport(user, {
      sourceUrl: 'https://example.com/recipes/stew',
      title: 'Stew',
    });
    const checkpoint = new Date(Date.now() - 1000).toISOString();
    await mongoose.models.SocialImportTombstone.create({
      deletedAt: new Date(),
      importId: socialImport._id,
      state: 'pending',
      user,
    });

    const delta = await listSocialImports(user, { since: checkpoint });

    expect(delta.deletedIds).toContain(socialImport._id);
    expect(delta.imports).toEqual([]);
    expect(await mongoose.models.SocialImport.exists({ _id: socialImport._id })).toBeNull();
  });

  test('paginates every incremental import when changes share a timestamp', async () => {
    const user = 'offline-import-pagination-user';
    const imports = await Promise.all(
      ['soup', 'salad', 'bread'].map((slug) =>
        createSocialImport(user, {
          sourceUrl: `https://example.com/recipes/${slug}`,
          title: slug,
        }),
      ),
    );
    const updatedAt = new Date('2026-07-29T10:00:00.000Z');
    await mongoose.models.SocialImport.updateMany(
      { _id: { $in: imports.map((item) => item._id) } },
      { $set: { updatedAt } },
      { timestamps: false },
    );

    const first = await listSocialImports(user, {
      limit: 2,
      since: '2026-07-29T09:59:00.000Z',
      until: '2026-07-29T10:01:00.000Z',
    });
    const second = await listSocialImports(user, {
      cursor: first.nextCursor,
      limit: 2,
      since: '2026-07-29T09:59:00.000Z',
      until: first.syncedAt,
    });

    expect(first.nextCursor).toBeDefined();
    expect([...first.imports, ...second.imports].map((item) => item._id).sort()).toEqual(
      imports.map((item) => item._id).sort(),
    );
  });

  test('normalizes and saves YouTube Shorts links', async () => {
    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://youtube.com/shorts/abc123?si=share&utm_source=app',
      title: 'Crispy potatoes',
    });

    expect(socialImport).toMatchObject({
      user: 'user-a',
      provider: 'youtube',
      providerContentId: 'abc123',
      canonicalUrl: 'https://www.youtube.com/shorts/abc123',
      title: 'Crispy potatoes',
      status: 'saved',
      provenance: 'unknown',
      embedHtmlAllowed: true,
    });
  });

  test('deduplicates repeated shares by canonical URL', async () => {
    const first = await createSocialImport('user-a', {
      sourceUrl: 'https://youtu.be/abc123?utm_campaign=first',
      title: 'First title',
    });
    const second = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=abc123&utm_source=second',
      title: 'Updated title',
    });
    const list = await listSocialImports('user-a', {});

    expect(second._id).toBe(first._id);
    expect(second.title).toBe('Updated title');
    expect(list.total).toBe(1);
    expect(list.imports[0].canonicalUrl).toBe('https://www.youtube.com/watch?v=abc123');
  });

  test('marks Instagram and TikTok links as needing review', async () => {
    const instagram = await createSocialImport('user-a', {
      sourceUrl: 'https://www.instagram.com/reel/reel123/?igshid=abc',
    });
    const tiktok = await createSocialImport('user-a', {
      sourceUrl: 'https://www.tiktok.com/@chef/video/987654321?utm_medium=share',
    });

    expect(instagram).toMatchObject({
      provider: 'instagram',
      providerContentId: 'reel123',
      canonicalUrl: 'https://www.instagram.com/reel/reel123/',
      status: 'needs_review',
    });
    expect(tiktok).toMatchObject({
      provider: 'tiktok',
      providerContentId: '987654321',
      creatorName: 'chef',
      canonicalUrl: 'https://www.tiktok.com/@chef/video/987654321',
      status: 'needs_review',
    });
  });

  test('filters, updates, and deletes owned imports', async () => {
    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://example.com/recipes/soup',
      title: 'Soup',
    });
    await createSocialImport('user-b', {
      sourceUrl: 'https://example.com/recipes/soup',
      title: 'Other user soup',
    });
    const updated = await updateSocialImport('user-a', socialImport._id, {
      status: 'inspiration',
      draftSummary: 'Keep this for later.',
      userSuppliedText: 'Caption ingredients:\n2 eggs\n1 cup rice',
    });
    const filtered = await listSocialImports('user-a', { status: 'inspiration', q: 'soup' });
    const deleted = await deleteSocialImport('user-a', socialImport._id);
    const otherUserList = await listSocialImports('user-b', {});

    expect(updated?.status).toBe('inspiration');
    expect(updated?.draftSummary).toBe('Keep this for later.');
    expect(updated?.userSuppliedText).toBe('Caption ingredients:\n2 eggs\n1 cup rice');
    expect(filtered.imports).toHaveLength(1);
    expect(deleted).toBe(true);
    expect(otherUserList.total).toBe(1);
  });

  test('searches imports across title, creator, provider, URLs, ids, and source text', async () => {
    const beer = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=beer123',
      title: 'Beer Cocktails Done Right',
    });
    await updateSocialImport('user-a', beer._id, {
      creatorName: 'Truffles on the Rocks',
      userSuppliedText: 'Shake with lemon, lager, and bitters.',
    });

    const mojito = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=mojito456',
      title: 'Easy Pre-Batched Mojitos',
    });
    await updateSocialImport('user-a', mojito._id, {
      creatorName: 'Truffles on the Rocks',
      userSuppliedText: 'Batch with mint syrup and lime.',
    });

    await createSocialImport('user-a', {
      sourceUrl: 'https://www.instagram.com/reel/pasta789/',
      title: 'Fresh Pasta',
      userSuppliedText: 'Roll pasta dough thin.',
    });

    const unordered = await listSocialImports('user-a', { q: 'cocktails beer' });
    const crossField = await listSocialImports('user-a', { q: 'truffles mojito' });
    const provider = await listSocialImports('user-a', { q: 'youtube' });
    const sourceDetails = await listSocialImports('user-a', { q: 'mint syrup' });
    const contentId = await listSocialImports('user-a', { q: 'pasta789' });

    expect(unordered.imports.map((item) => item._id)).toEqual([beer._id]);
    expect(crossField.imports.map((item) => item._id)).toEqual([mojito._id]);
    expect(provider.total).toBe(2);
    expect(sourceDetails.imports.map((item) => item._id)).toEqual([mojito._id]);
    expect(contentId.imports[0]._id).toBeDefined();
    expect(contentId.imports[0].provider).toBe('instagram');
  });

  test('filters imports by user-facing workflow views', async () => {
    const ready = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=ready123',
      userSuppliedText: 'Caption:\n1 cup rice\nSteam until tender.',
    });
    const saved = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=saved123',
      userSuppliedText: 'Caption:\n2 eggs\nScramble gently.',
    });
    await updateSocialImport('user-a', saved._id, { status: 'saved_recipe' });
    await createSocialImport('user-a', {
      sourceUrl: 'https://www.instagram.com/reel/help123/',
    });

    const readyView = await listSocialImports('user-a', { view: 'ready' });
    const savedView = await listSocialImports('user-a', { view: 'saved' });
    const needsHelpView = await listSocialImports('user-a', { view: 'needs_help' });

    expect(readyView.imports.map((item) => item._id)).toEqual([ready._id]);
    expect(savedView.imports.map((item) => item._id)).toEqual([saved._id]);
    expect(needsHelpView.imports).toHaveLength(1);
    expect(needsHelpView.imports[0].provider).toBe('instagram');
  });

  test('rejects malformed input and empty updates', async () => {
    await expect(createSocialImport('user-a', { sourceUrl: 'notaurl' })).rejects.toBeInstanceOf(
      SocialImportValidationError,
    );
    await expect(updateSocialImport('user-a', '507f1f77bcf86cd799439011', {})).rejects.toThrow(
      'Social import update is empty.',
    );
  });

  test('stores and updates user-supplied source details', async () => {
    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://www.tiktok.com/@chef/video/987654321',
      userSuppliedText: 'Video caption:\r\n1 block tofu\r\nCrisp it in a hot pan.',
    });

    expect(socialImport.userSuppliedText).toBe(
      'Video caption:\n1 block tofu\nCrisp it in a hot pan.',
    );
    expect(socialImport.status).toBe('draft_ready');
    expect(socialImport.provenance).toBe('user_edited');
    expect(socialImport.reviewMessage).toContain('Creator details saved');

    const cleared = await updateSocialImport('user-a', socialImport._id, {
      userSuppliedText: '',
    });

    expect(cleared?.userSuppliedText).toBe('');
    expect(cleared?.status).toBe('needs_review');
  });

  test('creates a persistent cooking draft from an import', async () => {
    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://www.instagram.com/reel/reel123/',
      title: 'Tomato toast',
    });
    const result = await createDraftFromSocialImport('user-a', socialImport._id, {
      conversationId: 'conversation-social-import',
      userSuppliedText: 'Caption:\n2 slices bread\n1 tomato\nToast bread and top with tomato.',
    });

    expect(result?.draft).toMatchObject({
      user: 'user-a',
      conversationId: 'conversation-social-import',
      documentType: 'recipe',
      selected: true,
    });
    expect(result?.draft.prompt).toContain('2 slices bread');
    expect(result?.draft.prompt).not.toContain('https://');
    expect(result?.draft.documentMarkdown).toContain('## Ingredients');
    expect(result?.draft.documentMarkdown).toContain('Raw extracted source text is used privately');
    expect(result?.draft.documentMarkdown).not.toContain('2 slices bread');
    expect(result?.socialImport).toMatchObject({
      _id: socialImport._id,
      status: 'draft_ready',
      draftId: result?.draft._id,
      draftConversationId: 'conversation-social-import',
    });
  });

  test('queues and processes web recipe extraction jobs', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_WEB_EXTRACTION_IN_TEST = 'true';
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    const html = `
      <script type="application/ld+json">
        ${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Recipe',
          name: 'Lemon Rice',
          image: 'https://images.example/lemon-rice.jpg',
          recipeIngredient: ['2 cups rice', '1 lemon', '1 tsp mustard seeds'],
          recipeInstructions: ['Toast mustard seeds.', 'Fold in rice and lemon.'],
        })}
      </script>
    `;
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    jest.mocked(fetchRemoteImage).mockResolvedValue({
      buffer: Buffer.from('persisted-source-image'),
      contentType: 'image/jpeg',
    });

    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://example.com/lemon-rice',
    });

    expect(socialImport.status).toBe('processing');

    const job = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });
    expect(job).toMatchObject({ status: 'queued', stage: 'queued' });

    await processSocialImportJob(String(job._id));

    const processedImport = await listSocialImports('user-a', { q: 'mustard' });
    const processedJob = await mongoose.models.SocialImportJob.findById(job._id).lean();

    expect(processedImport.imports[0]).toMatchObject({
      status: 'draft_ready',
      provenance: 'source_exact',
      title: 'Lemon Rice',
      thumbnailUrl: 'https://images.example/lemon-rice.jpg',
      thumbnailAssetAvailable: true,
    });
    expect(processedImport.imports[0].extractedText).toContain('2 cups rice');
    expect(processedJob).toMatchObject({
      status: 'succeeded',
      stage: 'extracted_source_text',
    });
    expect(fetchRemoteImage).toHaveBeenCalledWith('https://images.example/lemon-rice.jpg', {
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 5000,
    });
    expect(createIllustrationThumbnail).toHaveBeenCalledWith({
      buffer: Buffer.from('persisted-source-image'),
      contentType: 'image/jpeg',
    });
    await expect(getSocialImportThumbnail('user-a', socialImport._id)).resolves.toEqual({
      buffer: Buffer.from('persisted-thumbnail'),
      contentType: 'image/webp',
    });
  });

  test('atomically claims a queued import job once', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_WEB_EXTRACTION_IN_TEST = 'true';
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        `<script type="application/ld+json">${JSON.stringify({
          '@type': 'Recipe',
          name: 'Claimed Soup',
          recipeIngredient: ['1 cup stock', '1 cup beans'],
          recipeInstructions: ['Simmer together.'],
        })}</script>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );
    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://example.com/claimed-soup',
    });
    const job = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });

    await Promise.all([
      processSocialImportJob(String(job._id)),
      processSocialImportJob(String(job._id)),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(mongoose.models.SocialImportJob.findById(job._id).lean()).resolves.toMatchObject({
      status: 'succeeded',
      attemptCount: 1,
    });
  });

  test('queues and processes YouTube metadata when configured', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    process.env.YOUTUBE_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              snippet: {
                title: 'Paneer Skewers',
                description: 'Ingredients:\n200g paneer\n1 tbsp yogurt\n\nGrill until charred.',
                channelTitle: 'Chef Rekky',
                channelId: 'channel-123',
                thumbnails: { high: { url: 'https://i.ytimg.com/high.jpg' } },
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/shorts/video123',
    });

    expect(socialImport.status).toBe('processing');

    const job = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });
    await processSocialImportJob(String(job._id));

    const processedImport = await listSocialImports('user-a', { q: 'paneer' });
    expect(processedImport.imports[0]).toMatchObject({
      status: 'draft_ready',
      provenance: 'source_exact',
      title: 'Paneer Skewers',
      creatorName: 'Chef Rekky',
      creatorUrl: 'https://www.youtube.com/channel/channel-123',
      thumbnailUrl: 'https://i.ytimg.com/high.jpg',
    });
    expect(processedImport.imports[0].extractedText).toContain('200g paneer');
  });

  test('extracts a creator-linked recipe page from YouTube descriptions', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    process.env.YOUTUBE_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.googleapis.com') {
        return new Response(
          JSON.stringify({
            items: [
              {
                snippet: {
                  title: 'Chicken Quesadillas',
                  description:
                    'COOK the full recipe on https://nickskitchen.com/chipotle-chicken-quesadillas\nSHOP at https://www.osmokitchen.com',
                  channelTitle: "Nick's Kitchen",
                  channelId: 'channel-123',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Recipe',
          name: 'Chipotle Chicken Quesadillas',
          recipeIngredient: ['2 tortillas', '1 cup cooked chicken', '1 cup Monterey Jack'],
          recipeInstructions: ['Fill the tortillas.', 'Cook until crisp and molten.'],
        })}</script>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    });

    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=quesadilla123',
    });
    const job = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });
    await processSocialImportJob(String(job._id));

    const processedImport = await listSocialImports('user-a', { q: 'quesadilla' });

    expect(processedImport.imports[0]).toMatchObject({
      status: 'draft_ready',
      title: 'Chipotle Chicken Quesadillas',
      draftSummary: 'Found the creator-linked recipe page from the YouTube description.',
    });
    expect(processedImport.imports[0].extractedText).toContain(
      'Linked recipe source: https://nickskitchen.com/chipotle-chicken-quesadillas',
    );
    expect(processedImport.imports[0].extractedText).toContain('1 cup Monterey Jack');
    expect(processedImport.imports[0].extractedText).not.toContain('SHOP at');
  });

  test('queues and processes YouTube transcripts when the adapter is enabled', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    process.env.YOUTUBE_TRANSCRIPT_ADAPTER = 'enabled';
    setExperimentalYouTubeTranscriptFetcherForTest(async () => ({
      status: 'found',
      source: 'experimental_ytdlp',
      text: 'Use 2 potatoes, olive oil, salt, and paprika. Roast until crispy.',
      language: 'en',
    }));

    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=transcript123',
    });

    expect(socialImport.status).toBe('processing');

    const job = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });
    expect(job).toMatchObject({
      provider: 'youtube',
      providerContentId: 'transcript123',
    });

    await processSocialImportJob(String(job._id));

    const processedImport = await listSocialImports('user-a', { q: 'paprika' });
    expect(processedImport.imports[0]).toMatchObject({
      status: 'draft_ready',
      provenance: 'source_exact',
    });
    expect(processedImport.imports[0].extractedText).toContain('Transcript:');
    expect(processedImport.imports[0].draftSummary).toBe(
      'Found source-provided text from the YouTube transcript.',
    );
  });

  test('reuses cached YouTube transcripts without another fetch', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    process.env.YOUTUBE_TRANSCRIPT_ADAPTER = 'enabled';
    let fetchCount = 0;
    setExperimentalYouTubeTranscriptFetcherForTest(async () => {
      fetchCount += 1;
      return {
        status: 'found',
        source: 'experimental_ytdlp',
        text: 'Whisk eggs with scallions, soy sauce, and sesame oil.',
      };
    });

    const first = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=cached123',
    });
    const firstJob = await mongoose.models.SocialImportJob.findOne({
      socialImportId: first._id,
    });
    await processSocialImportJob(String(firstJob._id));

    process.env.YOUTUBE_TRANSCRIPT_PER_USER_DAILY_LIMIT = '0';

    const second = await createSocialImport('user-b', {
      sourceUrl: 'https://www.youtube.com/watch?v=cached123',
    });
    const secondJob = await mongoose.models.SocialImportJob.findOne({
      socialImportId: second._id,
    });
    await processSocialImportJob(String(secondJob._id));

    expect(fetchCount).toBe(1);
    const processedImport = await listSocialImports('user-b', { q: 'scallions' });
    expect(processedImport.imports[0].status).toBe('draft_ready');
  });

  test('does not queue a second unique YouTube transcript after the user daily cap', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    process.env.YOUTUBE_TRANSCRIPT_ADAPTER = 'enabled';
    process.env.YOUTUBE_TRANSCRIPT_PER_USER_DAILY_LIMIT = '1';
    setExperimentalYouTubeTranscriptFetcherForTest(async () => ({
      status: 'found',
      source: 'experimental_ytdlp',
      text: 'Mix noodles with chili crisp.',
    }));

    const first = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=quota123',
    });
    const second = await createSocialImport('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=quota456',
    });

    expect(first.status).toBe('processing');
    expect(second.status).toBe('saved');
    expect(second.reviewMessage).toContain('eligible source text');
  });

  test('subscribes to a YouTube playlist and imports new videos only', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    let playlistItemsCall = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/playlistItems')) {
        playlistItemsCall += 1;
        const videos =
          playlistItemsCall === 1
            ? [
                { videoId: 'video-one', title: 'Chili Oil Noodles' },
                { videoId: 'video-two', title: 'Crispy Rice' },
              ]
            : [
                { videoId: 'video-one', title: 'Chili Oil Noodles' },
                { videoId: 'video-two', title: 'Crispy Rice' },
                { videoId: 'video-three', title: 'Miso Soup' },
              ];
        return new Response(
          JSON.stringify({
            items: videos.map((video, position) => ({
              snippet: {
                title: video.title,
                description: `${video.title} description`,
                channelTitle: 'Recipe Playlist',
                position,
              },
              contentDetails: { videoId: video.videoId },
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          items: [{ snippet: { title: 'Weeknight Recipes' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const created = await createSocialPlaylistSubscription('user-a', {
      sourceUrl: 'https://www.youtube.com/playlist?list=PLrecipes',
    });
    const imports = await listSocialImports('user-a', { provider: 'youtube' });
    const listed = await listSocialPlaylistSubscriptions('user-a');

    expect(created.importsCreated).toBe(2);
    expect(created.subscription).toMatchObject({
      playlistId: 'PLrecipes',
      title: 'Weeknight Recipes',
      status: 'active',
      importCount: 2,
    });
    expect(imports.total).toBe(2);
    expect(listed.subscriptions).toHaveLength(1);

    const synced = await syncSocialPlaylistSubscription('user-a', created.subscription._id, true);
    const afterSync = await listSocialImports('user-a', { provider: 'youtube' });

    expect(synced?.importsCreated).toBe(1);
    expect(afterSync.total).toBe(3);

    const paused = await updateSocialPlaylistSubscription('user-a', created.subscription._id, {
      status: 'paused',
    });
    expect(paused?.status).toBe('paused');
    await expect(
      deleteSocialPlaylistSubscription('user-a', created.subscription._id),
    ).resolves.toBe(true);
  });

  test('saves a playlist subscription when automatic sync is not configured', async () => {
    const created = await createSocialPlaylistSubscription('user-a', {
      sourceUrl: 'https://www.youtube.com/watch?v=video-one&list=PLrecipes',
    });
    const listed = await listSocialPlaylistSubscriptions('user-a');
    const imports = await listSocialImports('user-a', { provider: 'youtube' });

    expect(created.importsCreated).toBe(0);
    expect(created.subscription).toMatchObject({
      playlistId: 'PLrecipes',
      status: 'failed',
      importCount: 0,
      lastErrorMessage: 'YouTube playlist sync is not configured on this server.',
    });
    expect(listed.subscriptions).toHaveLength(1);
    expect(imports.total).toBe(0);
  });

  test('lists jobs and retries failed imports', async () => {
    process.env.SOCIAL_IMPORT_ENABLE_WEB_EXTRACTION_IN_TEST = 'true';
    process.env.SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST = 'true';
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('temporary source failure'))
      .mockResolvedValueOnce(
        new Response(
          `<script type="application/ld+json">${JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Recipe',
            name: 'Retry Dal',
            recipeIngredient: ['1 cup dal', '2 cups water'],
            recipeInstructions: ['Simmer until soft.'],
          })}</script>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        ),
      );

    const socialImport = await createSocialImport('user-a', {
      sourceUrl: 'https://example.com/retry-dal',
    });
    const firstJob = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
    });

    await processSocialImportJob(String(firstJob._id));

    const failedJobs = await listSocialImportJobs('user-a', socialImport._id);
    expect(failedJobs?.jobs[0]).toMatchObject({
      status: 'failed',
      lastErrorCode: 'extract_source_text_failed',
    });

    const retry = await retrySocialImportProcessing('user-a', socialImport._id);
    expect(retry?.status).toBe('processing');

    const retryJob = await mongoose.models.SocialImportJob.findOne({
      socialImportId: socialImport._id,
      status: 'queued',
    });
    await processSocialImportJob(String(retryJob._id));

    const processedImport = await listSocialImports('user-a', { q: 'dal' });
    expect(processedImport.imports[0]).toMatchObject({
      status: 'draft_ready',
      title: 'Retry Dal',
    });
  });
});
