import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import mongoose from 'mongoose';
import type { ISocialTranscript } from '@librechat/data-schemas';

const execFileAsync = promisify(execFile);
const maxTranscriptChars = 30_000;
const ytdlpTimeoutMs = 20_000;
const ytdlpMaxBufferBytes = 1024 * 1024;
const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{6,32}$/;

export type TranscriptResult =
  | {
      status: 'found';
      source: 'experimental_ytdlp' | 'creator_authorized_caption' | 'user_pasted';
      text: string;
      language?: string;
    }
  | { status: 'not_available'; reason: string }
  | { status: 'temporarily_failed'; reason: string; retryAfterHours: number };

export type ExperimentalYouTubeTranscriptFetcher = (
  videoId: string,
) => Promise<TranscriptResult>;

let testFetcher: ExperimentalYouTubeTranscriptFetcher | undefined;

function model() {
  return mongoose.model<ISocialTranscript>('SocialTranscript');
}

function cleanNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function retryDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function startOfDay(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function globalDailyLimit(): number {
  return cleanNumber(process.env.YOUTUBE_TRANSCRIPT_GLOBAL_DAILY_LIMIT, 100, 0, 10_000);
}

export function youtubeTranscriptUserDailyLimit(): number {
  return cleanNumber(process.env.YOUTUBE_TRANSCRIPT_PER_USER_DAILY_LIMIT, 6, 0, 100);
}

export function isYouTubeTranscriptAdapterEnabled(): boolean {
  return process.env.YOUTUBE_TRANSCRIPT_ADAPTER === 'enabled';
}

function validVideoId(videoId: string): boolean {
  return youtubeVideoIdPattern.test(videoId.trim());
}

function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function captionLanguage(): string {
  return process.env.YOUTUBE_TRANSCRIPT_LANGS?.trim() || 'en.*,en';
}

function ytdlpPath(): string {
  return process.env.YOUTUBE_TRANSCRIPT_YTDLP_PATH?.trim() || 'yt-dlp';
}

function ytdlpArgs(videoId: string, outputDir: string): string[] {
  return [
    '--skip-download',
    '--no-playlist',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    captionLanguage(),
    '--sub-format',
    'vtt/srt/best',
    '--convert-subs',
    'srt',
    '--paths',
    outputDir,
    '--output',
    '%(id)s.%(ext)s',
    youtubeUrl(videoId),
  ];
}

function isTimestampLine(line: string): boolean {
  return /-->|^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}$/.test(line);
}

function isCaptionMetadataLine(line: string): boolean {
  return (
    !line ||
    line === 'WEBVTT' ||
    /^\d+$/.test(line) ||
    /^Kind:/i.test(line) ||
    /^Language:/i.test(line) ||
    /^(NOTE|STYLE|REGION)\b/i.test(line) ||
    isTimestampLine(line)
  );
}

function cleanCaptionText(line: string): string {
  return line
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCaptionTranscript(content: string): string {
  const lines: string[] = [];
  let previous = '';
  for (const rawLine of content.replace(/\r\n?/g, '\n').split('\n')) {
    const clean = cleanCaptionText(rawLine.trim());
    if (isCaptionMetadataLine(clean) || clean === previous) {
      continue;
    }
    lines.push(clean);
    previous = clean;
  }
  return lines.join('\n').slice(0, maxTranscriptChars);
}

async function captionFiles(outputDir: string): Promise<string[]> {
  const entries = await readdir(outputDir);
  return entries
    .filter((entry) => /\.(srt|vtt)$/i.test(entry))
    .map((entry) => path.join(outputDir, entry));
}

async function bestTranscriptFromFiles(files: string[]): Promise<string> {
  let best = '';
  for (const file of files) {
    const parsed = parseCaptionTranscript(await readFile(file, 'utf8'));
    if (parsed.length > best.length) {
      best = parsed;
    }
  }
  return best;
}

async function runYtDlpTranscript(videoId: string): Promise<TranscriptResult> {
  if (!validVideoId(videoId)) {
    return { status: 'not_available', reason: 'Invalid YouTube video id.' };
  }

  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'rekky-youtube-transcript-'));
  try {
    await execFileAsync(ytdlpPath(), ytdlpArgs(videoId, outputDir), {
      timeout: ytdlpTimeoutMs,
      maxBuffer: ytdlpMaxBufferBytes,
    });
    const text = await bestTranscriptFromFiles(await captionFiles(outputDir));
    if (!text.trim()) {
      return { status: 'not_available', reason: 'No usable caption text was found.' };
    }
    return {
      status: 'found',
      source: 'experimental_ytdlp',
      text,
      language: captionLanguage(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcript command failed.';
    return {
      status: 'temporarily_failed',
      reason: message.slice(0, 500),
      retryAfterHours: 12,
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function withinGlobalDailyLimit(): Promise<boolean> {
  const limit = globalDailyLimit();
  if (limit === 0) {
    return false;
  }
  const count = await model().countDocuments({
    provider: 'youtube',
    lastAttemptedAt: { $gte: startOfDay() },
  });
  return count < limit;
}

function cachedResult(doc: ISocialTranscript): TranscriptResult | undefined {
  if (doc.status === 'found' && doc.text?.trim()) {
    return {
      status: 'found',
      source: doc.source === 'unknown' ? 'experimental_ytdlp' : doc.source,
      text: doc.text,
      language: doc.language,
    };
  }
  if (doc.nextAttemptAt && doc.nextAttemptAt > new Date()) {
    if (doc.status === 'temporarily_failed') {
      return {
        status: 'temporarily_failed',
        reason: doc.failureReason || doc.lastErrorMessage || 'Transcript fetch is cooling down.',
        retryAfterHours: 12,
      };
    }
    return {
      status: 'not_available',
      reason: doc.failureReason || 'Transcript is not currently available.',
    };
  }
  return undefined;
}

async function recordTranscriptResult(
  videoId: string,
  result: TranscriptResult,
): Promise<TranscriptResult> {
  const now = new Date();
  const base = {
    provider: 'youtube',
    providerContentId: videoId,
    lastAttemptedAt: now,
  };
  if (result.status === 'found') {
    await model().findOneAndUpdate(
      { provider: 'youtube', providerContentId: videoId },
      {
        $set: {
          ...base,
          status: 'found',
          source: result.source,
          text: result.text,
          language: result.language,
          failureReason: '',
          lastErrorMessage: '',
        },
        $unset: { nextAttemptAt: 1 },
        $inc: { attemptCount: 1 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return result;
  }

  await model().findOneAndUpdate(
    { provider: 'youtube', providerContentId: videoId },
    {
      $set: {
        ...base,
        status: result.status,
        source: 'unknown',
        text: '',
        failureReason: result.reason,
        lastErrorMessage: result.reason,
        nextAttemptAt:
          result.status === 'temporarily_failed' ? retryDate(result.retryAfterHours) : retryDate(72),
      },
      $inc: { attemptCount: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return result;
}

export async function hasCachedYouTubeTranscriptText(videoId: string): Promise<boolean> {
  if (!validVideoId(videoId)) {
    return false;
  }
  const doc = await model().findOne({
    provider: 'youtube',
    providerContentId: videoId,
    status: 'found',
    text: { $type: 'string', $ne: '' },
  });
  return Boolean(doc);
}

export async function getYouTubeTranscript(videoId: string): Promise<TranscriptResult> {
  if (!validVideoId(videoId)) {
    return { status: 'not_available', reason: 'Invalid YouTube video id.' };
  }

  const existing = await model().findOne({ provider: 'youtube', providerContentId: videoId });
  const cached = existing ? cachedResult(existing) : undefined;
  if (cached) {
    return cached;
  }
  if (!isYouTubeTranscriptAdapterEnabled()) {
    return { status: 'not_available', reason: 'Transcript adapter is disabled.' };
  }
  if (!(await withinGlobalDailyLimit())) {
    return {
      status: 'temporarily_failed',
      reason: 'Daily transcript attempt limit reached.',
      retryAfterHours: 24,
    };
  }

  const fetcher = testFetcher ?? runYtDlpTranscript;
  return recordTranscriptResult(videoId, await fetcher(videoId));
}

export function setExperimentalYouTubeTranscriptFetcherForTest(
  fetcher: ExperimentalYouTubeTranscriptFetcher | undefined,
): void {
  testFetcher = fetcher;
}
