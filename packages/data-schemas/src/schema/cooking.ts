import { Schema } from 'mongoose';
import type { ICookingDraft, ICookingSession, ICookingSessionEvent, ISavedRecipe } from '~/types';

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
    documentMarkdown: { type: String, default: '' },
    recipe: { type: structuredRecipeSchema, required: true },
    expiresAt: { type: Date, required: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

cookingDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
cookingDraftSchema.index({ user: 1, status: 1, updatedAt: -1, tenantId: 1 });
cookingDraftSchema.index({ user: 1, conversationId: 1, status: 1, tenantId: 1 });

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
    shortDescription: { type: String, default: '' },
    illustrationUrl: { type: String, default: '' },
    illustrationStatus: {
      type: String,
      enum: ['pending', 'complete', 'failed'],
      default: 'pending',
      required: true,
    },
    illustrationModel: { type: String },
    documentMarkdown: { type: String, required: true },
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
savedRecipeSchema.index({ user: 1, sourceDraftId: 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.cuisine': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.mealType': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.diet': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.timeBucket': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.mainIngredients': 1, tenantId: 1 });
savedRecipeSchema.index({ user: 1, 'categorization.equipment': 1, tenantId: 1 });
