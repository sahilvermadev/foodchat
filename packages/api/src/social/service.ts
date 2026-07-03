import mongoose from 'mongoose';
import type {
  CookingDocument,
  CreateSocialImportRequest,
  CreateSocialImportDraftRequest,
  CreateSocialPlaylistSubscriptionRequest,
  SocialImport,
  SocialImportDraftResponse,
  SocialImportJob,
  SocialImportJobsResponse,
  SocialImportProvider,
  SocialPlaylistSubscription,
  SocialPlaylistSubscriptionResponse,
  SocialPlaylistSubscriptionsResponse,
  SocialImportsQuery,
  SocialImportsResponse,
  SocialImportStatus,
  UpdateSocialPlaylistSubscriptionRequest,
  UpdateSocialImportRequest,
} from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type {
  ISocialImport,
  ISocialImportJob,
  ISocialPlaylistSubscription,
} from '@librechat/data-schemas';
import {
  extractFirstLinkedRecipe,
  extractWebRecipe,
  fetchYouTubeMetadata,
  fetchYouTubePlaylist,
} from './extract';
import {
  getYouTubeTranscript,
  hasCachedYouTubeTranscriptText,
  isYouTubeTranscriptAdapterEnabled,
  youtubeTranscriptUserDailyLimit,
} from './transcript';
import { createCookingDocument } from '../cooking/service';

const maxLimit = 1000;
const webExtractionEnabledInTest = 'SOCIAL_IMPORT_ENABLE_WEB_EXTRACTION_IN_TEST';
const jobsEnabledInTest = 'SOCIAL_IMPORT_ENABLE_JOBS_IN_TEST';
const autoRunJobsEnabledInTest = 'SOCIAL_IMPORT_AUTO_RUN_JOBS_IN_TEST';
let playlistSyncInterval: NodeJS.Timeout | undefined;
const trackingParams = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
  'si',
]);

type NormalizedSource = {
  sourceUrl: string;
  canonicalUrl: string;
  provider: SocialImportProvider;
  providerContentId?: string;
  creatorName?: string;
  creatorUrl?: string;
  embedHtmlAllowed: boolean;
};

type SocialImportListFilter = {
  user: string;
  provider?: SocialImportProvider;
  status?: SocialImportStatus;
  createdAt?: { $lt: Date };
  $or?: Array<{
    status?: SocialImportStatus | { $in: SocialImportStatus[] };
    extractedText?: { $exists: false } | '';
  }>;
  $and?: SocialImportSearchClause[];
};

type SocialImportSearchClause = {
  $or: Array<{
    title?: RegExp;
    sourceUrl?: RegExp;
    canonicalUrl?: RegExp;
    creatorName?: RegExp;
    provider?: RegExp;
    providerContentId?: RegExp;
    extractedText?: RegExp;
    userSuppliedText?: RegExp;
  }>;
};

type ExtractedSourceText = {
  ingredientCount?: number;
  instructionCount?: number;
  title?: string;
  creatorName?: string;
  creatorUrl?: string;
  thumbnailUrl?: string;
  extractedText?: string;
  draftSummary?: string;
};

export class SocialImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialImportValidationError';
  }
}

function model() {
  return mongoose.model<ISocialImport>('SocialImport');
}

function jobModel() {
  return mongoose.model<ISocialImportJob>('SocialImportJob');
}

function playlistModel() {
  return mongoose.model<ISocialPlaylistSubscription>('SocialPlaylistSubscription');
}

function idOf(doc: { _id: unknown }): string {
  return String(doc._id);
}

function iso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function firstSharedUrl(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  return (match?.[0] ?? trimmed).replace(/[),.]+$/, '');
}

function cleanText(value: string | null | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanMultilineText(value: string | null | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return '';
  }
  const clean = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return clean.slice(0, maxLength);
}

function cleanUrl(raw: string): URL {
  const extracted = firstSharedUrl(raw);
  let url: URL;
  try {
    url = new URL(extracted);
  } catch {
    throw new SocialImportValidationError('Social import URL is invalid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SocialImportValidationError('Social import URL must use HTTP or HTTPS.');
  }

  url.protocol = 'https:';
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  trackingParams.forEach((param) => url.searchParams.delete(param));
  return url;
}

function pathSegment(url: URL, index: number): string | undefined {
  return url.pathname.split('/').filter(Boolean)[index];
}

function youtubeId(url: URL): string | undefined {
  if (url.hostname === 'youtu.be') {
    return pathSegment(url, 0);
  }
  if (pathSegment(url, 0) === 'shorts' || pathSegment(url, 0) === 'embed') {
    return pathSegment(url, 1);
  }
  return url.searchParams.get('v') ?? undefined;
}

function youtubePlaylistId(url: URL): string | undefined {
  const id = url.searchParams.get('list') ?? undefined;
  return cleanText(id, 140);
}

function normalizeYoutube(url: URL): NormalizedSource {
  const id = youtubeId(url);
  if (!id) {
    return {
      sourceUrl: url.toString(),
      canonicalUrl: url.toString(),
      provider: 'youtube',
      embedHtmlAllowed: true,
    };
  }

  const isShort = pathSegment(url, 0) === 'shorts';
  return {
    sourceUrl: url.toString(),
    canonicalUrl: isShort
      ? `https://www.youtube.com/shorts/${encodeURIComponent(id)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    provider: 'youtube',
    providerContentId: id,
    embedHtmlAllowed: true,
  };
}

function normalizeInstagram(url: URL): NormalizedSource {
  const kind = pathSegment(url, 0);
  const id = pathSegment(url, 1);
  const canonicalKind = kind === 'reel' || kind === 'p' || kind === 'tv' ? kind : undefined;
  return {
    sourceUrl: url.toString(),
    canonicalUrl:
      canonicalKind && id
        ? `https://www.instagram.com/${canonicalKind}/${encodeURIComponent(id)}/`
        : url.toString(),
    provider: 'instagram',
    providerContentId: id,
    embedHtmlAllowed: true,
  };
}

function normalizeTikTok(url: URL): NormalizedSource {
  const creator = pathSegment(url, 0)?.startsWith('@') ? pathSegment(url, 0) : undefined;
  const id = pathSegment(url, 1) === 'video' ? pathSegment(url, 2) : undefined;
  return {
    sourceUrl: url.toString(),
    canonicalUrl:
      creator && id
        ? `https://www.tiktok.com/${creator}/video/${encodeURIComponent(id)}`
        : url.toString(),
    provider: 'tiktok',
    providerContentId: id,
    creatorName: creator?.replace(/^@/, ''),
    creatorUrl: creator ? `https://www.tiktok.com/${creator}` : undefined,
    embedHtmlAllowed: true,
  };
}

function normalizeSource(raw: string): NormalizedSource {
  const url = cleanUrl(raw);
  if (url.hostname === 'youtube.com' || url.hostname === 'm.youtube.com' || url.hostname === 'youtu.be') {
    return normalizeYoutube(url);
  }
  if (url.hostname === 'instagram.com') {
    return normalizeInstagram(url);
  }
  if (url.hostname === 'tiktok.com' || url.hostname === 'vm.tiktok.com') {
    return normalizeTikTok(url);
  }
  return {
    sourceUrl: url.toString(),
    canonicalUrl: url.toString(),
    provider: 'web',
    embedHtmlAllowed: false,
  };
}

function normalizeYoutubePlaylist(raw: string): {
  sourceUrl: string;
  playlistId: string;
} {
  const url = cleanUrl(raw);
  if (url.hostname !== 'youtube.com' && url.hostname !== 'm.youtube.com') {
    throw new SocialImportValidationError('YouTube playlist URL is required.');
  }
  const playlistId = youtubePlaylistId(url);
  if (!playlistId) {
    throw new SocialImportValidationError('YouTube playlist URL is missing a playlist id.');
  }
  return {
    sourceUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
    playlistId,
  };
}

function initialStatus(provider: SocialImportProvider): SocialImportStatus {
  if (provider === 'instagram' || provider === 'tiktok') {
    return 'needs_review';
  }
  return 'saved';
}

function reviewMessage(provider: SocialImportProvider): string {
  if (provider === 'instagram') {
    return 'Saved. Paste the caption or creator recipe text when you want Rekky to build a cookable draft.';
  }
  if (provider === 'tiktok') {
    return 'Saved. Rekky needs caption text, a linked recipe, or creator-provided details before making a recipe card.';
  }
  if (provider === 'youtube') {
    return 'Saved. Rekky will use eligible source text first; video transcript analysis needs a compliant media source.';
  }
  return 'Saved. Rekky can turn this into a draft when the page includes usable recipe text.';
}

function readyReviewMessage(provider: SocialImportProvider): string {
  if (provider === 'instagram' || provider === 'tiktok') {
    return 'Creator details saved. Rekky can now use the source link and your pasted text to make a cookable draft.';
  }
  if (provider === 'youtube') {
    return 'Source details saved. Rekky can use the source link and provided text before estimating anything missing.';
  }
  return 'Recipe details saved. Rekky can use this text to make a cookable draft from the source.';
}

function statusForAvailableText(
  provider: SocialImportProvider,
  userSuppliedText: string | undefined,
  extractedText?: string,
): SocialImportStatus {
  return userSuppliedText?.trim() || extractedText?.trim() ? 'draft_ready' : initialStatus(provider);
}

function draftSummaryForDetails(userSuppliedText: string): string {
  const firstLine = userSuppliedText.split('\n').find((line) => line.trim())?.trim() ?? '';
  return firstLine
    ? `User-provided source details: ${firstLine}`.slice(0, 500)
    : 'User-provided source details are available for drafting.';
}

function shouldExtractWebRecipe(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return process.env[webExtractionEnabledInTest] === 'true';
  }
  return process.env.SOCIAL_IMPORT_WEB_EXTRACTION !== 'false';
}

function shouldRunImportJobs(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return process.env[jobsEnabledInTest] === 'true';
  }
  return process.env.SOCIAL_IMPORT_JOBS !== 'false';
}

function shouldFetchYouTubeMetadata(source: NormalizedSource): boolean {
  return (
    source.provider === 'youtube' &&
    Boolean(source.providerContentId && process.env.YOUTUBE_API_KEY)
  );
}

async function hasRemainingYouTubeTranscriptJobQuota(user: string): Promise<boolean> {
  const limit = youtubeTranscriptUserDailyLimit();
  if (limit === 0) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await jobModel().countDocuments({
    user,
    provider: 'youtube',
    createdAt: { $gte: today },
  });
  return count < limit;
}

async function shouldFetchYouTubeTranscript(
  user: string,
  source: NormalizedSource,
): Promise<boolean> {
  if (source.provider !== 'youtube' || !source.providerContentId) {
    return false;
  }
  if (await hasCachedYouTubeTranscriptText(source.providerContentId)) {
    return true;
  }
  return isYouTubeTranscriptAdapterEnabled() && (await hasRemainingYouTubeTranscriptJobQuota(user));
}

async function canExtractSource(user: string, source: NormalizedSource): Promise<boolean> {
  if (source.provider === 'web') {
    return shouldExtractWebRecipe();
  }
  return shouldFetchYouTubeMetadata(source) || shouldFetchYouTubeTranscript(user, source);
}

async function shouldQueueSourceExtraction(
  user: string,
  source: NormalizedSource,
  userSuppliedText?: string,
): Promise<boolean> {
  return (
    !userSuppliedText?.trim() &&
    shouldRunImportJobs() &&
    (await canExtractSource(user, source))
  );
}

function sourceTextReviewMessage(provider: SocialImportProvider): string {
  if (provider === 'youtube') {
    return 'Source details found from YouTube. Rekky can use them to make a cookable draft.';
  }
  return 'Recipe text found on the source page. Rekky can use it to make a cookable draft.';
}

function processingReviewMessage(provider: SocialImportProvider): string {
  if (provider === 'youtube') {
    return 'Saved. Rekky is reading eligible YouTube source text.';
  }
  return 'Saved. Rekky is reading eligible recipe text from the source page.';
}

function noRecipeTextReviewMessage(provider: SocialImportProvider): string {
  if (provider === 'youtube') {
    return 'Saved. Rekky could not find enough recipe text from YouTube. Paste the caption, transcript, or creator details to create a draft.';
  }
  return 'Saved. Rekky could not find structured recipe text on the source page. Paste details to create a draft.';
}

function draftSummaryForExtractedText(ingredientCount: number, instructionCount: number): string {
  return `Found ${ingredientCount} ingredients and ${instructionCount} steps from the source page.`;
}

function agentEvidenceText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"')\]]+/gi, '[source link]');
}

function extractedMetadataUpdate(extracted: ExtractedSourceText) {
  const title = cleanText(extracted.title, 140);
  const creatorName = cleanText(extracted.creatorName, 120);
  const creatorUrl = cleanText(extracted.creatorUrl, 500);
  const thumbnailUrl = cleanText(extracted.thumbnailUrl, 1000);
  return {
    ...(title ? { title } : {}),
    ...(creatorName ? { creatorName } : {}),
    ...(creatorUrl ? { creatorUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

async function extractSourceText(source: NormalizedSource): Promise<ExtractedSourceText> {
  if (source.provider === 'youtube') {
    const metadata = shouldFetchYouTubeMetadata(source)
      ? await fetchYouTubeMetadata(source.providerContentId ?? '')
      : undefined;
    const transcript = source.providerContentId
      ? await getYouTubeTranscript(source.providerContentId)
      : { status: 'not_available' as const, reason: 'Missing YouTube video id.' };
    const linkedRecipe = metadata?.description
      ? await extractFirstLinkedRecipe(metadata.description)
      : undefined;
    const extractedText =
      (linkedRecipe
        ? `Linked recipe source: ${linkedRecipe.sourceUrl}\n${linkedRecipe.text}`
        : undefined) ||
      (transcript.status === 'found' && transcript.text.trim()
        ? `Transcript:\n${transcript.text.trim()}`
        : metadata?.description);
    if (!extractedText?.trim() && transcript.status === 'temporarily_failed') {
      throw new Error(transcript.reason);
    }
    if (!extractedText?.trim()) {
      return {
        title: metadata?.title,
        creatorName: metadata?.creatorName,
        creatorUrl: metadata?.creatorUrl,
        thumbnailUrl: metadata?.thumbnailUrl,
      };
    }
    return {
      title: linkedRecipe?.title ?? metadata?.title,
      creatorName: metadata?.creatorName,
      creatorUrl: metadata?.creatorUrl,
      thumbnailUrl: metadata?.thumbnailUrl,
      extractedText,
      draftSummary:
        linkedRecipe
          ? 'Found the creator-linked recipe page from the YouTube description.'
          : transcript.status === 'found'
          ? 'Found source-provided text from the YouTube transcript.'
          : 'Found source-provided text from YouTube metadata.',
    };
  }
  if (source.provider !== 'web' || !shouldExtractWebRecipe()) {
    return {};
  }
  try {
    const extracted = await extractWebRecipe(source.canonicalUrl);
    if (!extracted?.text) {
      return {};
    }
    return {
      ingredientCount: extracted.ingredientCount,
      instructionCount: extracted.instructionCount,
      title: extracted.title,
      thumbnailUrl: extracted.thumbnailUrl,
      extractedText: extracted.text,
      draftSummary: draftSummaryForExtractedText(
        extracted.ingredientCount,
        extracted.instructionCount,
      ),
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Web recipe extraction failed.');
  }
}

function serializeSocialImport(doc: ISocialImport): SocialImport {
  return {
    _id: idOf(doc),
    user: doc.user,
    sourceUrl: doc.sourceUrl,
    canonicalUrl: doc.canonicalUrl,
    provider: doc.provider,
    providerContentId: doc.providerContentId,
    creatorName: doc.creatorName,
    creatorUrl: doc.creatorUrl,
    title: doc.title,
    thumbnailUrl: doc.thumbnailUrl,
    userSuppliedText: doc.userSuppliedText,
    extractedText: doc.extractedText,
    extractedAt: doc.extractedAt ? iso(doc.extractedAt) : undefined,
    draftId: doc.draftId,
    draftConversationId: doc.draftConversationId,
    embedHtmlAllowed: doc.embedHtmlAllowed,
    status: doc.status,
    reviewMessage: doc.reviewMessage,
    draftSummary: doc.draftSummary,
    savedRecipeId: doc.savedRecipeId,
    provenance: doc.provenance,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function serializeSocialImportJob(doc: ISocialImportJob): SocialImportJob {
  return {
    _id: idOf(doc),
    user: doc.user,
    socialImportId: doc.socialImportId,
    provider: doc.provider,
    providerContentId: doc.providerContentId,
    status: doc.status,
    stage: doc.stage,
    attemptCount: doc.attemptCount,
    lastErrorCode: doc.lastErrorCode,
    lastErrorMessage: doc.lastErrorMessage,
    startedAt: doc.startedAt ? iso(doc.startedAt) : undefined,
    completedAt: doc.completedAt ? iso(doc.completedAt) : undefined,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function serializeSocialPlaylistSubscription(
  doc: ISocialPlaylistSubscription,
): SocialPlaylistSubscription {
  return {
    _id: idOf(doc),
    user: doc.user,
    provider: doc.provider,
    playlistId: doc.playlistId,
    sourceUrl: doc.sourceUrl,
    title: doc.title,
    status: doc.status,
    importCount: doc.importCount,
    lastSyncedAt: doc.lastSyncedAt ? iso(doc.lastSyncedAt) : undefined,
    nextSyncAt: doc.nextSyncAt ? iso(doc.nextSyncAt) : undefined,
    lastErrorMessage: doc.lastErrorMessage,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function cleanLimit(limit: number | string | undefined): number {
  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  if (!parsed || !Number.isFinite(parsed)) {
    return 30;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), maxLimit);
}

function parseCursor(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchTerms(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function searchClause(term: string): SocialImportSearchClause {
  const regex = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [
      { title: regex },
      { sourceUrl: regex },
      { canonicalUrl: regex },
      { creatorName: regex },
      { provider: regex },
      { providerContentId: regex },
      { extractedText: regex },
      { userSuppliedText: regex },
    ],
  };
}

function applyViewFilter(filter: SocialImportListFilter, query: SocialImportsQuery): void {
  if (query.status) {
    filter.status = query.status;
    return;
  }
  if (query.view === 'ready') {
    filter.status = 'draft_ready';
    return;
  }
  if (query.view === 'processing') {
    filter.status = 'processing';
    return;
  }
  if (query.view === 'saved') {
    filter.status = 'saved_recipe';
    return;
  }
  if (query.view === 'needs_help') {
    filter.$or = [
      { status: { $in: ['failed', 'needs_review'] } },
      { status: 'saved', extractedText: { $exists: false } },
      { status: 'saved', extractedText: '' },
    ];
  }
}

function buildFilter(user: string, query: SocialImportsQuery): SocialImportListFilter {
  const filter: SocialImportListFilter = { user };
  if (query.provider) {
    filter.provider = query.provider;
  }
  applyViewFilter(filter, query);
  const cursor = parseCursor(query.cursor);
  if (cursor) {
    filter.createdAt = { $lt: cursor };
  }
  const terms = searchTerms(query.q ?? '');
  if (terms.length) {
    filter.$and = terms.map(searchClause);
  }
  return filter;
}

function importTitle(socialImport: Pick<SocialImport, 'title' | 'providerContentId' | 'canonicalUrl'>): string {
  return socialImport.title?.trim() || socialImport.providerContentId || socialImport.canonicalUrl;
}

function playlistSyncLimit(): number {
  const value = Number(process.env.SOCIAL_PLAYLIST_SYNC_MAX_ITEMS);
  if (!Number.isFinite(value)) {
    return 200;
  }
  return Math.min(Math.max(Math.floor(value), 1), 500);
}

function playlistSyncIntervalHours(): number {
  const value = Number(process.env.SOCIAL_PLAYLIST_SYNC_INTERVAL_HOURS);
  if (!Number.isFinite(value)) {
    return 12;
  }
  return Math.min(Math.max(value, 1), 168);
}

function playlistSchedulerIntervalMs(): number {
  const value = Number(process.env.SOCIAL_PLAYLIST_SCHEDULER_INTERVAL_MS);
  if (!Number.isFinite(value)) {
    return 15 * 60 * 1000;
  }
  return Math.min(Math.max(Math.floor(value), 60_000), 24 * 60 * 60 * 1000);
}

function nextPlaylistSyncDate(): Date {
  return new Date(Date.now() + playlistSyncIntervalHours() * 60 * 60 * 1000);
}

function playlistSyncNotConfiguredMessage(): string {
  return 'YouTube playlist sync is not configured on this server.';
}

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function draftPromptFromImport(socialImport: SocialImport): string {
  const sourceEvidence = [
    socialImport.extractedText?.trim()
      ? `Extracted source evidence:\n${agentEvidenceText(socialImport.extractedText.trim())}`
      : '',
    socialImport.userSuppliedText?.trim()
      ? `User-provided creator details:\n${agentEvidenceText(socialImport.userSuppliedText.trim())}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    `Reconstruct the recipe from this saved ${socialImport.provider} source.`,
    `Working title: ${importTitle(socialImport)}`,
    socialImport.creatorName ? `Creator: ${socialImport.creatorName}` : '',
    '',
    'Goal:',
    '- Produce the final cookable recipe the user expects to see, not a dump of scraped description, transcript, captions, links, or extraction notes.',
    '- Use every available source signal: YouTube description, transcript/captions, user-provided caption text, linked recipe text, creator title, and source metadata.',
    '- Reconstruct the recipe shown or described in the video as closely as possible.',
    '- Apply the user\'s saved cooking preferences, dietary rules, location, equipment, and taste profile where available.',
    '- Preserve exact source facts when they exist. When the source is incomplete, make a practical cookable version and label estimated quantities or inferred steps as estimated.',
    '- Keep attribution concise in a Notes section; do not expose raw source evidence in the visible recipe.',
    '',
    sourceEvidence || 'No detailed source evidence was extracted yet. Ask the user for the caption, recipe link, or ingredient notes if critical facts are missing.',
  ]
    .join('\n\n');
}

function documentMarkdownFromImport(socialImport: SocialImport): string {
  return [
    `# ${importTitle(socialImport)}`,
    '',
    'Rekky is reconstructing this recipe from the saved source. Use the chat panel to ask for changes, or save once the recipe matches what you want to cook.',
    '',
    '## Recipe Data',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Source | Saved social video |',
    `| Creator | ${socialImport.creatorName || 'Unknown'} |`,
    '| Servings | To be reconstructed |',
    '| Total time | To be reconstructed |',
    '',
    '## Ingredients',
    '',
    '| Ingredient | Metric | Imperial | State/Form | Notes |',
    '| --- | ---: | ---: | --- | --- |',
    '| To be reconstructed |  |  |  | Rekky will use the source evidence and your preferences. |',
    '',
    '## Instructions',
    '',
    '1. Rekky will replace this scaffold with a cookable recipe reconstructed from the saved source.',
    '',
    '## Notes',
    '',
    `- Source: ${socialImport.canonicalUrl}`,
    socialImport.creatorName ? `- Creator: ${socialImport.creatorName}` : '',
    '- Raw extracted source text is used privately as evidence and is not shown here.',
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== '')
    .join('\n')
    .trim();
}

function normalizedSourceFromImport(socialImport: ISocialImport): NormalizedSource {
  return {
    sourceUrl: socialImport.sourceUrl,
    canonicalUrl: socialImport.canonicalUrl,
    provider: socialImport.provider,
    providerContentId: socialImport.providerContentId,
    creatorName: socialImport.creatorName,
    creatorUrl: socialImport.creatorUrl,
    embedHtmlAllowed: socialImport.embedHtmlAllowed,
  };
}

function jobErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown import job failure.';
}

export async function processSocialImportJob(jobId: string): Promise<void> {
  const job = await jobModel().findById(jobId);
  if (!job || job.status === 'succeeded') {
    return;
  }

  await job.updateOne({
    $set: { status: 'processing', stage: 'extract_source_text', startedAt: new Date() },
    $inc: { attemptCount: 1 },
    $unset: { lastErrorCode: 1, lastErrorMessage: 1 },
  });

  try {
    const socialImport = await model().findOne({ _id: job.socialImportId, user: job.user });
    if (!socialImport) {
      await job.updateOne({
        $set: {
          status: 'failed',
          stage: 'missing_import',
          lastErrorCode: 'missing_import',
          lastErrorMessage: 'Social import no longer exists.',
          completedAt: new Date(),
        },
      });
      return;
    }

    const extracted = await extractSourceText(normalizedSourceFromImport(socialImport));
    if (!extracted.extractedText?.trim()) {
      await Promise.all([
        model().updateOne(
          { _id: socialImport._id, user: socialImport.user },
          {
            $set: {
              status: 'needs_review',
              reviewMessage: noRecipeTextReviewMessage(socialImport.provider),
              draftSummary:
                socialImport.provider === 'youtube'
                  ? 'No usable recipe text was found from YouTube.'
                  : 'No structured recipe text was found on the source page.',
              provenance: 'unknown',
              ...extractedMetadataUpdate(extracted),
            },
          },
        ),
        job.updateOne({
          $set: { status: 'succeeded', stage: 'no_recipe_text', completedAt: new Date() },
        }),
      ]);
      return;
    }

    await Promise.all([
      model().updateOne(
        { _id: socialImport._id, user: socialImport.user },
        {
          $set: {
            ...extractedMetadataUpdate(extracted),
            extractedText: extracted.extractedText,
            extractedAt: new Date(),
            status: 'draft_ready',
            reviewMessage: sourceTextReviewMessage(socialImport.provider),
            draftSummary:
              extracted.draftSummary ??
              draftSummaryForExtractedText(
                extracted.ingredientCount ?? 0,
                extracted.instructionCount ?? 0,
              ),
            provenance: 'source_exact',
          },
        },
      ),
      job.updateOne({
        $set: { status: 'succeeded', stage: 'extracted_source_text', completedAt: new Date() },
      }),
    ]);
  } catch (error) {
    const message = jobErrorMessage(error);
    await Promise.all([
      model().updateOne(
        { _id: job.socialImportId, user: job.user },
        {
          $set: {
            status: 'failed',
            reviewMessage: 'Saved, but Rekky could not read the source. Paste details to create a draft.',
            draftSummary: message,
            provenance: 'unknown',
          },
        },
      ),
      job.updateOne({
        $set: {
          status: 'failed',
          stage: 'failed',
          lastErrorCode: 'extract_source_text_failed',
          lastErrorMessage: message,
          completedAt: new Date(),
        },
      }),
    ]);
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('[SocialImportJob] failed', { jobId, error: message });
    }
  }
}

async function queueSocialImportJob(doc: ISocialImport): Promise<void> {
  const activeJob = await jobModel().findOne({
    user: doc.user,
    socialImportId: idOf(doc),
    status: { $in: ['queued', 'processing'] },
  });
  if (activeJob) {
    return;
  }
  const job = await jobModel().create({
    user: doc.user,
    socialImportId: idOf(doc),
    provider: doc.provider,
    providerContentId: doc.providerContentId,
    status: 'queued',
    stage: 'queued',
    attemptCount: 0,
  });
  if (process.env.NODE_ENV !== 'test' || process.env[autoRunJobsEnabledInTest] === 'true') {
    void processSocialImportJob(idOf(job));
  }
}

export async function createSocialImport(
  user: string,
  payload: CreateSocialImportRequest,
): Promise<SocialImport> {
  const sourceUrl = payload.sourceUrl?.trim();
  if (!sourceUrl) {
    throw new SocialImportValidationError('Social import URL is required.');
  }

  const source = normalizeSource(sourceUrl);
  const userSuppliedText = cleanMultilineText(payload.userSuppliedText, 6000);
  const queueExtraction = await shouldQueueSourceExtraction(user, source, userSuppliedText);
  const title = cleanText(payload.title, 140);
  const detailsReady = Boolean(userSuppliedText?.trim());
  const update = {
    ...source,
    ...(title ? { title } : {}),
    ...(userSuppliedText !== undefined ? { userSuppliedText } : {}),
    status: queueExtraction
      ? ('processing' as const)
      : statusForAvailableText(source.provider, userSuppliedText),
    reviewMessage: queueExtraction
      ? processingReviewMessage(source.provider)
      : detailsReady
        ? readyReviewMessage(source.provider)
        : reviewMessage(source.provider),
    ...(queueExtraction
      ? { draftSummary: 'Source extraction queued.' }
      : detailsReady
        ? { draftSummary: draftSummaryForDetails(userSuppliedText!) }
        : {}),
    provenance: detailsReady ? ('user_edited' as const) : ('unknown' as const),
  };
  const doc = await model().findOneAndUpdate(
    { user, canonicalUrl: source.canonicalUrl },
    { $set: update, $setOnInsert: { user } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (queueExtraction) {
    await queueSocialImportJob(doc);
  }
  return serializeSocialImport(doc);
}

export async function createDraftFromSocialImport(
  user: string,
  importId: string,
  payload: CreateSocialImportDraftRequest & { conversationId: string },
): Promise<SocialImportDraftResponse | null> {
  const existing = await model().findOne({ _id: importId, user });
  if (!existing) {
    return null;
  }

  let socialImport = serializeSocialImport(existing);
  if (payload.userSuppliedText !== undefined) {
    const updated = await updateSocialImport(user, importId, {
      userSuppliedText: payload.userSuppliedText,
    });
    if (!updated) {
      return null;
    }
    socialImport = updated;
  }

  const draft: CookingDocument = await createCookingDocument(
    user,
    draftPromptFromImport(socialImport),
    payload.conversationId,
    documentMarkdownFromImport(socialImport),
    'recipe',
  );

  const updatedDoc = await model().findOneAndUpdate(
    { _id: importId, user },
    {
      $set: {
        draftId: draft._id,
        draftConversationId: payload.conversationId,
        status: 'draft_ready',
        draftSummary: `Draft created for ${importTitle(socialImport)}`.slice(0, 500),
      },
    },
    { new: true },
  );
  if (!updatedDoc) {
    return null;
  }
  return { socialImport: serializeSocialImport(updatedDoc), draft };
}

export async function listSocialImports(
  user: string,
  query: SocialImportsQuery,
): Promise<SocialImportsResponse> {
  const limit = cleanLimit(query.limit);
  const filter = buildFilter(user, query);
  const [total, imports] = await Promise.all([
    model().countDocuments(filter),
    model().find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1),
  ]);
  const page = imports.slice(0, limit).map(serializeSocialImport);
  const nextCursor = imports.length > limit ? iso(imports[limit - 1].createdAt) : undefined;
  return { imports: page, total, nextCursor };
}

export async function listSocialImportJobs(
  user: string,
  importId: string,
): Promise<SocialImportJobsResponse | null> {
  const socialImport = await model().exists({ _id: importId, user });
  if (!socialImport) {
    return null;
  }
  const jobs = await jobModel().find({ user, socialImportId: importId }).sort({ createdAt: -1 });
  return { jobs: jobs.map(serializeSocialImportJob) };
}

async function importMissingPlaylistVideos(
  user: string,
  items: Array<{ videoId: string; title?: string }>,
): Promise<number> {
  const videoIds = items.map((item) => item.videoId);
  if (!videoIds.length) {
    return 0;
  }
  const existingImports = await model()
    .find({ user, provider: 'youtube', providerContentId: { $in: videoIds } })
    .select('providerContentId');
  const existingVideoIds = new Set(existingImports.map((item) => item.providerContentId));
  const missingItems = items.filter((item) => !existingVideoIds.has(item.videoId));
  await Promise.all(
    missingItems.map((item) =>
      createSocialImport(user, {
        sourceUrl: youtubeWatchUrl(item.videoId),
        title: item.title,
      }),
    ),
  );
  return missingItems.length;
}

export async function syncSocialPlaylistSubscription(
  user: string,
  subscriptionId: string,
  force = false,
): Promise<SocialPlaylistSubscriptionResponse | null> {
  const subscription = await playlistModel().findOne({ _id: subscriptionId, user });
  if (!subscription) {
    return null;
  }
  if (subscription.status === 'paused' && !force) {
    return {
      subscription: serializeSocialPlaylistSubscription(subscription),
      importsCreated: 0,
    };
  }
  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    const failed = await playlistModel().findOneAndUpdate(
      { _id: subscriptionId, user },
      {
        $set: {
          status: 'failed',
          nextSyncAt: nextPlaylistSyncDate(),
          lastErrorMessage: playlistSyncNotConfiguredMessage(),
        },
      },
      { new: true },
    );
    if (!failed) {
      return null;
    }
    return {
      subscription: serializeSocialPlaylistSubscription(failed),
      importsCreated: 0,
    };
  }

  try {
    const playlist = await fetchYouTubePlaylist(subscription.playlistId, playlistSyncLimit());
    const importsCreated = await importMissingPlaylistVideos(user, playlist.items);
    const updated = await playlistModel().findOneAndUpdate(
      { _id: subscriptionId, user },
      {
        $set: {
          title: cleanText(playlist.title, 140) ?? subscription.title,
          status: 'active',
          lastSyncedAt: new Date(),
          nextSyncAt: nextPlaylistSyncDate(),
          lastErrorMessage: '',
        },
        $inc: { importCount: importsCreated },
      },
      { new: true },
    );
    if (!updated) {
      return null;
    }
    return {
      subscription: serializeSocialPlaylistSubscription(updated),
      importsCreated,
    };
  } catch (error) {
    const message = jobErrorMessage(error);
    const failed = await playlistModel().findOneAndUpdate(
      { _id: subscriptionId, user },
      {
        $set: {
          status: 'failed',
          nextSyncAt: nextPlaylistSyncDate(),
          lastErrorMessage: message,
        },
      },
      { new: true },
    );
    if (!failed) {
      return null;
    }
    logger.warn('[SocialPlaylistSync] failed', { subscriptionId, error: message });
    return {
      subscription: serializeSocialPlaylistSubscription(failed),
      importsCreated: 0,
    };
  }
}

export async function createSocialPlaylistSubscription(
  user: string,
  payload: CreateSocialPlaylistSubscriptionRequest,
): Promise<SocialPlaylistSubscriptionResponse> {
  const sourceUrl = payload.sourceUrl?.trim();
  if (!sourceUrl) {
    throw new SocialImportValidationError('YouTube playlist URL is required.');
  }
  const source = normalizeYoutubePlaylist(sourceUrl);

  const doc = await playlistModel().findOneAndUpdate(
    { user, provider: 'youtube', playlistId: source.playlistId },
    {
      $set: {
        sourceUrl: source.sourceUrl,
        status: 'active',
        nextSyncAt: new Date(),
        lastErrorMessage: '',
      },
      $setOnInsert: {
        user,
        provider: 'youtube',
        playlistId: source.playlistId,
        importCount: 0,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const synced = await syncSocialPlaylistSubscription(user, idOf(doc), true);
  if (!synced) {
    throw new SocialImportValidationError('Could not create playlist subscription.');
  }
  return synced;
}

export async function listSocialPlaylistSubscriptions(
  user: string,
): Promise<SocialPlaylistSubscriptionsResponse> {
  const subscriptions = await playlistModel()
    .find({ user })
    .sort({ updatedAt: -1, _id: -1 });
  return { subscriptions: subscriptions.map(serializeSocialPlaylistSubscription) };
}

export async function updateSocialPlaylistSubscription(
  user: string,
  subscriptionId: string,
  payload: UpdateSocialPlaylistSubscriptionRequest,
): Promise<SocialPlaylistSubscription | null> {
  if (payload.status == null) {
    throw new SocialImportValidationError('Playlist subscription update is empty.');
  }
  if (!['active', 'paused', 'failed'].includes(payload.status)) {
    throw new SocialImportValidationError('Playlist subscription status is malformed.');
  }
  const doc = await playlistModel().findOneAndUpdate(
    { _id: subscriptionId, user },
    {
      $set: {
        status: payload.status,
        ...(payload.status === 'active' ? { nextSyncAt: new Date() } : {}),
      },
    },
    { new: true },
  );
  return doc ? serializeSocialPlaylistSubscription(doc) : null;
}

export async function deleteSocialPlaylistSubscription(
  user: string,
  subscriptionId: string,
): Promise<boolean> {
  const result = await playlistModel().deleteOne({ _id: subscriptionId, user });
  return result.deletedCount === 1;
}

export async function processDueSocialPlaylistSyncs(limit = 10): Promise<number> {
  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return 0;
  }
  const subscriptions = await playlistModel()
    .find({
      status: 'active',
      $or: [{ nextSyncAt: { $lte: new Date() } }, { nextSyncAt: { $exists: false } }],
    })
    .sort({ nextSyncAt: 1, updatedAt: 1 })
    .limit(Math.max(1, Math.min(Math.floor(limit), 50)));
  await Promise.all(
    subscriptions.map((subscription) =>
      syncSocialPlaylistSubscription(subscription.user, idOf(subscription), false),
    ),
  );
  return subscriptions.length;
}

export function startSocialPlaylistSyncScheduler(): void {
  if (playlistSyncInterval || process.env.SOCIAL_PLAYLIST_SYNC_SCHEDULER === 'false') {
    return;
  }
  playlistSyncInterval = setInterval(() => {
    void processDueSocialPlaylistSyncs().catch((error) => {
      logger.warn('[SocialPlaylistSync] scheduler failed', { error: jobErrorMessage(error) });
    });
  }, playlistSchedulerIntervalMs());
  playlistSyncInterval.unref?.();
}

export async function retrySocialImportProcessing(
  user: string,
  importId: string,
): Promise<SocialImport | null> {
  const existing = await model().findOne({ _id: importId, user });
  if (!existing) {
    return null;
  }
  const source = normalizedSourceFromImport(existing);
  if (!(await canExtractSource(user, source)) || !shouldRunImportJobs()) {
    throw new SocialImportValidationError(
      'This social import does not have an automated extraction source configured.',
    );
  }
  const updated = await model().findOneAndUpdate(
    { _id: importId, user },
    {
      $set: {
        status: 'processing',
        reviewMessage: processingReviewMessage(existing.provider),
        draftSummary: 'Source extraction queued.',
        provenance: 'unknown',
      },
    },
    { new: true },
  );
  if (!updated) {
    return null;
  }
  await queueSocialImportJob(updated);
  return serializeSocialImport(updated);
}

export async function sweepStuckSocialImports(): Promise<number> {
  const activeJobs = await jobModel().find({
    status: { $in: ['queued', 'processing'] },
  });
  if (!activeJobs.length) {
    return 0;
  }
  const jobIds = activeJobs.map(j => idOf(j));
  const importIds = activeJobs.map(j => j.socialImportId);
  
  await Promise.all([
    jobModel().updateMany(
      { _id: { $in: jobIds } },
      {
        $set: {
          status: 'failed',
          stage: 'failed',
          lastErrorCode: 'server_restart',
          lastErrorMessage: 'Import interrupted by server restart.',
          completedAt: new Date(),
        }
      }
    ),
    model().updateMany(
      { _id: { $in: importIds }, status: 'processing' },
      {
        $set: {
          status: 'failed',
          reviewMessage: 'Saved, but the import was interrupted. Click retry to resume.',
          draftSummary: 'Import interrupted by server restart.',
          provenance: 'unknown',
        }
      }
    )
  ]);
  
  if (process.env.NODE_ENV !== 'test') {
    logger.info(`[sweepStuckSocialImports] Marked ${activeJobs.length} stuck social import jobs as failed.`);
  }
  return activeJobs.length;
}

export async function processQueuedSocialImportJobs(limit = 10): Promise<number> {
  const jobs = await jobModel()
    .find({ status: 'queued' })
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.min(Math.floor(limit), 50)));
  await Promise.all(jobs.map((job) => processSocialImportJob(idOf(job))));
  return jobs.length;
}

export async function updateSocialImport(
  user: string,
  importId: string,
  payload: UpdateSocialImportRequest,
): Promise<SocialImport | null> {
  if (
    payload.status == null &&
    payload.title == null &&
    payload.creatorName == null &&
    payload.userSuppliedText == null &&
    payload.draftSummary == null &&
    payload.savedRecipeId == null
  ) {
    throw new SocialImportValidationError('Social import update is empty.');
  }
  const existing = await model().findOne({ _id: importId, user });
  if (!existing) {
    return null;
  }
  const userSuppliedText = cleanMultilineText(payload.userSuppliedText, 6000);
  const detailsWereUpdated = payload.userSuppliedText !== undefined;
  const detailsReady = Boolean(userSuppliedText?.trim());
  const sourceTextReady = Boolean(existing.extractedText?.trim());
  const autoStatus = detailsWereUpdated
    ? statusForAvailableText(existing.provider, userSuppliedText, existing.extractedText)
    : undefined;
  const update = {
    ...(payload.status ? { status: payload.status } : autoStatus ? { status: autoStatus } : {}),
    ...(cleanText(payload.title, 140) ? { title: cleanText(payload.title, 140) } : {}),
    ...(cleanText(payload.creatorName, 120)
      ? { creatorName: cleanText(payload.creatorName, 120) }
      : {}),
    ...(payload.userSuppliedText !== undefined
      ? {
          userSuppliedText,
          reviewMessage: detailsReady
            ? readyReviewMessage(existing.provider)
            : sourceTextReady
              ? sourceTextReviewMessage(existing.provider)
              : reviewMessage(existing.provider),
          provenance: detailsReady
            ? ('user_edited' as const)
            : sourceTextReady
              ? ('source_exact' as const)
              : ('unknown' as const),
        }
      : {}),
    ...(detailsReady && userSuppliedText
      ? { draftSummary: draftSummaryForDetails(userSuppliedText) }
      : {}),
    ...(cleanText(payload.draftSummary, 500)
      ? { draftSummary: cleanText(payload.draftSummary, 500) }
      : {}),
    ...(cleanText(payload.savedRecipeId, 120)
      ? { savedRecipeId: cleanText(payload.savedRecipeId, 120) }
      : {}),
  };
  if (!Object.keys(update).length) {
    throw new SocialImportValidationError('Social import update is empty.');
  }
  const doc = await model().findOneAndUpdate({ _id: importId, user }, { $set: update }, { new: true });
  return doc ? serializeSocialImport(doc) : null;
}

export async function deleteSocialImport(user: string, importId: string): Promise<boolean> {
  const result = await model().deleteOne({ _id: importId, user });
  return result.deletedCount === 1;
}
