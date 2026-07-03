import { Schema } from 'mongoose';
import type {
  ICookingDraft,
  ICookingSession,
  ICookingSessionEvent,
  ISavedRecipe,
  ISocialImport,
  ISocialImportJob,
  ISocialPlaylistSubscription,
  ISocialTranscript,
  IGuestLimit,
} from '~/types';

const timerSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    durationSeconds: { type: Number, required: true },
  },
  { _id: false },
);

const temperatureSchema = new Schema(
  {
    value: { type: Number, required: true },
    unit: { type: String, enum: ['F', 'C'], required: true },
    appliance: { type: String },
  },
  { _id: false },
);

const ingredientSchema = new Schema(
  {
    id: { type: String, required: true },
    originalText: { type: String, required: true },
    quantity: { type: Number },
    unit: { type: String },
    item: { type: String, required: true },
    preparation: { type: String },
    quantityType: {
      type: String,
      enum: ['measured', 'estimated', 'to_taste'],
      required: true,
      default: 'measured',
    },
  },
  { _id: false },
);

const recipeStepSchema = new Schema(
  {
    id: { type: String, required: true },
    order: { type: Number, required: true },
    text: { type: String, required: true },
    ingredientIds: { type: [String], default: [] },
    timers: { type: [timerSchema], default: [] },
    temperature: { type: temperatureSchema },
    warnings: { type: [String], default: [] },
    tips: { type: [String], default: [] },
  },
  { _id: false },
);

export const structuredRecipeSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    servings: { type: Number, required: true, min: 1 },
    timing: {
      prepMinutes: { type: Number, required: true, min: 0 },
      cookMinutes: { type: Number, required: true, min: 0 },
      totalMinutes: { type: Number, required: true, min: 0 },
    },
    ingredients: { type: [ingredientSchema], required: true },
    steps: { type: [recipeStepSchema], required: true },
    notes: { type: [String], default: [] },
    tags: { type: [String], default: [] },
  },
  { _id: false },
);

export const cookingDraftSchema = new Schema<ICookingDraft>(
  {
    user: { type: String, required: true, index: true },
    conversationId: { type: String, index: true },
    prompt: { type: String, required: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', required: true },
    documentType: {
      type: String,
      enum: ['recipe', 'guide', 'prep_plan'],
      default: 'recipe',
      required: true,
    },
    selected: { type: Boolean, default: false, required: true },
    documentMarkdown: { type: String, default: '' },
    recipe: { type: structuredRecipeSchema, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

cookingDraftSchema.index({ user: 1, status: 1, updatedAt: -1, tenantId: 1 });
cookingDraftSchema.index({ user: 1, conversationId: 1, status: 1, tenantId: 1 });
cookingDraftSchema.index({ user: 1, conversationId: 1, selected: 1, tenantId: 1 });

export const cookingSessionSchema = new Schema<ICookingSession>(
  {
    user: { type: String, required: true, index: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active', required: true },
    currentStepIndex: { type: Number, default: 0, min: 0 },
    draftId: { type: String, index: true },
    recipeSnapshot: { type: structuredRecipeSchema, required: true },
    summary: {
      notes: { type: [String], default: [] },
      substitutions: {
        type: [
          new Schema(
            {
              ingredientId: { type: String },
              text: { type: String, required: true },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
      problems: { type: [String], default: [] },
      rating: { type: Number, min: 1, max: 5 },
      reviewNote: { type: String },
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

cookingSessionSchema.index({ user: 1, updatedAt: -1, tenantId: 1 });

export const cookingSessionEventSchema = new Schema<ICookingSessionEvent>(
  {
    user: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    stepIndex: { type: Number },
    event: { type: Schema.Types.Mixed, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

cookingSessionEventSchema.index({ sessionId: 1, createdAt: 1, tenantId: 1 });

const recipeCategorizationSchema = new Schema(
  {
    cuisine: { type: [String], default: [] },
    mealType: { type: [String], default: [] },
    dishType: { type: [String], default: [] },
    diet: { type: [String], default: [] },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
    timeBucket: { type: String, enum: ['under_15', 'under_30', 'under_60', 'long_cook'] },
    occasion: { type: [String], default: [] },
    equipment: { type: [String], default: [] },
    mainIngredients: { type: [String], default: [] },
    techniques: { type: [String], default: [] },
    flavorProfile: { type: [String], default: [] },
    confidence: { type: Number, min: 0, max: 1 },
    source: { type: String, enum: ['llm'], required: true },
    model: { type: String },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const savedRecipeSchema = new Schema<ISavedRecipe>(
  {
    user: { type: String, required: true, index: true },
    title: { type: String, required: true },
    documentType: {
      type: String,
      enum: ['recipe', 'guide', 'prep_plan'],
      default: 'recipe',
      required: true,
    },
    shortDescription: { type: String, default: '' },
    illustrationUrl: { type: String, default: '' },
    illustrationData: { type: Buffer },
    illustrationContentType: { type: String },
    illustrationThumbnail: { type: Buffer },
    illustrationStatus: {
      type: String,
      enum: ['pending', 'generating', 'complete', 'failed'],
      default: 'pending',
      required: true,
    },
    illustrationModel: { type: String },
    documentMarkdown: { type: String, required: true },
    saveList: {
      type: String,
      enum: ['want_to_cook', 'cooked_already'],
      default: 'want_to_cook',
      required: true,
    },
    recipe: { type: structuredRecipeSchema },
    sourceConversationId: { type: String, index: true },
    sourceDraftId: { type: String, index: true },
    categorization: { type: recipeCategorizationSchema },
    categorizationStatus: {
      type: String,
      enum: ['pending', 'complete', 'failed'],
      default: 'pending',
      required: true,
    },
    categorizationVersion: { type: Number, default: 1, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

savedRecipeSchema.index({ user: 1, updatedAt: -1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, title: 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, saveList: 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, sourceDraftId: 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.cuisine': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.mealType': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.diet': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.timeBucket': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.mainIngredients': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.equipment': 1, tenantId: 1 });

export const socialImportSchema = new Schema<ISocialImport>(
  {
    user: { type: String, required: true, index: true },
    sourceUrl: { type: String, required: true },
    canonicalUrl: { type: String, required: true },
    provider: {
      type: String,
      enum: ['youtube', 'instagram', 'tiktok', 'web', 'unknown'],
      default: 'unknown',
      required: true,
    },
    providerContentId: { type: String, index: true },
    creatorName: { type: String },
    creatorUrl: { type: String },
    title: { type: String },
    thumbnailUrl: { type: String },
    userSuppliedText: { type: String, default: '' },
    extractedText: { type: String, default: '' },
    extractedAt: { type: Date },
    draftId: { type: String, index: true },
    draftConversationId: { type: String, index: true },
    embedHtmlAllowed: { type: Boolean, default: false, required: true },
    status: {
      type: String,
      enum: [
        'saved',
        'processing',
        'draft_ready',
        'needs_review',
        'saved_recipe',
        'inspiration',
        'failed',
      ],
      default: 'saved',
      required: true,
    },
    reviewMessage: { type: String },
    draftSummary: { type: String },
    savedRecipeId: { type: String, index: true },
    provenance: {
      type: String,
      enum: ['source_exact', 'creator_verified', 'rekky_estimated', 'user_edited', 'unknown'],
      default: 'unknown',
      required: true,
    },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

socialImportSchema.index({ user: 1, updatedAt: -1, tenantId: 1 });
socialImportSchema.index({ user: 1, createdAt: -1, tenantId: 1 });
socialImportSchema.index({ user: 1, provider: 1, updatedAt: -1, tenantId: 1 });
socialImportSchema.index({ user: 1, status: 1, updatedAt: -1, tenantId: 1 });
socialImportSchema.index(
  { user: 1, canonicalUrl: 1, tenantId: 1 },
  { unique: true, partialFilterExpression: { canonicalUrl: { $type: 'string' } } },
);

export const socialImportJobSchema = new Schema<ISocialImportJob>(
  {
    user: { type: String, required: true, index: true },
    socialImportId: { type: String, required: true, index: true },
    provider: {
      type: String,
      enum: ['youtube', 'instagram', 'tiktok', 'web', 'unknown'],
      index: true,
    },
    providerContentId: { type: String, index: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'succeeded', 'failed'],
      default: 'queued',
      required: true,
      index: true,
    },
    stage: { type: String, default: 'queued', required: true },
    attemptCount: { type: Number, default: 0, required: true },
    lastErrorCode: { type: String },
    lastErrorMessage: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

socialImportJobSchema.index({ socialImportId: 1, createdAt: -1, tenantId: 1 });
socialImportJobSchema.index({ user: 1, provider: 1, createdAt: -1, tenantId: 1 });
socialImportJobSchema.index({ status: 1, updatedAt: 1, tenantId: 1 });

export const socialTranscriptSchema = new Schema<ISocialTranscript>(
  {
    provider: {
      type: String,
      enum: ['youtube', 'instagram', 'tiktok', 'web', 'unknown'],
      required: true,
      index: true,
    },
    providerContentId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['found', 'not_available', 'temporarily_failed'],
      required: true,
      default: 'temporarily_failed',
      index: true,
    },
    source: {
      type: String,
      enum: ['creator_authorized_caption', 'experimental_ytdlp', 'user_pasted', 'unknown'],
      required: true,
      default: 'unknown',
    },
    text: { type: String, default: '' },
    language: { type: String },
    failureReason: { type: String },
    lastErrorMessage: { type: String },
    attemptCount: { type: Number, default: 0, required: true },
    lastAttemptedAt: { type: Date },
    nextAttemptAt: { type: Date },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

socialTranscriptSchema.index(
  { provider: 1, providerContentId: 1, tenantId: 1 },
  { unique: true },
);
socialTranscriptSchema.index({ status: 1, nextAttemptAt: 1, tenantId: 1 });

export const socialPlaylistSubscriptionSchema = new Schema<ISocialPlaylistSubscription>(
  {
    user: { type: String, required: true, index: true },
    provider: { type: String, enum: ['youtube'], default: 'youtube', required: true },
    playlistId: { type: String, required: true, index: true },
    sourceUrl: { type: String, required: true },
    title: { type: String },
    status: {
      type: String,
      enum: ['active', 'paused', 'failed'],
      default: 'active',
      required: true,
      index: true,
    },
    importCount: { type: Number, default: 0, required: true },
    lastSyncedAt: { type: Date },
    nextSyncAt: { type: Date, index: true },
    lastErrorMessage: { type: String },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

socialPlaylistSubscriptionSchema.index(
  { user: 1, provider: 1, playlistId: 1, tenantId: 1 },
  { unique: true },
);
socialPlaylistSubscriptionSchema.index({ status: 1, nextSyncAt: 1, tenantId: 1 });

export const guestLimitSchema = new Schema<IGuestLimit>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

guestLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
