import mongoose from 'mongoose';
import type { PreferencesDocument } from 'librechat-data-provider';
import type { IPreferences } from '@librechat/data-schemas';
import { renderPreferencesMarkdown } from './artifact';

export class PreferencesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreferencesValidationError';
  }
}

const maxMarkdownLength = 20000;

function iso(date?: Date): string {
  return (date ?? new Date()).toISOString();
}

function serialize(doc: IPreferences): PreferencesDocument {
  return {
    _id: String(doc._id),
    user: doc.user,
    markdown: renderPreferencesMarkdown(doc.markdown ?? ''),
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

function validateMarkdown(markdown: string): string {
  if (typeof markdown !== 'string') {
    throw new PreferencesValidationError('Preferences markdown is required.');
  }
  if (markdown.length > maxMarkdownLength) {
    throw new PreferencesValidationError('Preferences markdown is too large.');
  }
  if (markdown.includes('\0')) {
    throw new PreferencesValidationError('Preferences markdown is malformed.');
  }
  return renderPreferencesMarkdown(markdown);
}

function model() {
  return mongoose.model<IPreferences>('Preferences');
}

export async function getPreferences(user: string): Promise<PreferencesDocument> {
  const Preferences = model();
  const existing = await Preferences.findOne({ user });
  if (existing) {
    return serialize(existing);
  }
  const created = await Preferences.create({ user, markdown: '' });
  return serialize(created);
}

export async function getExistingPreferences(user: string): Promise<PreferencesDocument | null> {
  const Preferences = model();
  const existing = await Preferences.findOne({ user });
  return existing ? serialize(existing) : null;
}

export async function updatePreferences(
  user: string,
  markdown: string,
): Promise<PreferencesDocument> {
  const Preferences = model();
  const cleanMarkdown = validateMarkdown(markdown);
  const doc = await Preferences.findOneAndUpdate(
    { user },
    { $set: { user, markdown: cleanMarkdown } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return serialize(doc);
}
