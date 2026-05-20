import { Schema } from 'mongoose';
import type { IPreferences } from '~/types';

export const preferencesSchema = new Schema<IPreferences>(
  {
    user: { type: String, required: true, index: true },
    markdown: { type: String, default: '' },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

preferencesSchema.index({ user: 1, tenantId: 1 }, { unique: true });
