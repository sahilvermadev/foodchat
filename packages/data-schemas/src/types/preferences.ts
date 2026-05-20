import type { Document } from 'mongoose';

export interface IPreferences extends Document {
  user: string;
  markdown: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
