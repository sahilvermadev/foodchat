import mongoose, { Schema } from 'mongoose';
import { ISession } from '~/types';

const sessionSchema: Schema<ISession> = new Schema(
  {
    refreshTokenHash: {
      type: String,
      required: true,
    },
    expiration: {
      type: Date,
      required: true,
      expires: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    clientType: {
      type: String,
      enum: ['web', 'mobile'],
      default: 'web',
      index: true,
    },
    installationId: {
      type: String,
    },
    deviceName: {
      type: String,
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
    },
    appVersion: {
      type: String,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

sessionSchema.index(
  { user: 1, installationId: 1 },
  { unique: true, partialFilterExpression: { clientType: 'mobile' } },
);

export default sessionSchema;
