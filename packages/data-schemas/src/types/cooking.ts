import type { Document } from 'mongoose';
import type {
  CookingSessionEvent,
  CookingSessionStatus,
  CookingDraftStatus,
  CookingDocumentType,
  StructuredRecipe,
  SavedRecipe,
  RecipeCategorizationStatus,
} from 'librechat-data-provider';

export interface ICookingDraft extends Document {
  user: string;
  conversationId?: string;
  prompt: string;
  status: CookingDraftStatus;
  documentType: CookingDocumentType;
  selected: boolean;
  documentMarkdown?: string;
  recipe: StructuredRecipe;
  expiresAt?: Date;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICookingSession extends Document {
  user: string;
  status: CookingSessionStatus;
  currentStepIndex: number;
  draftId?: string;
  recipeSnapshot: StructuredRecipe;
  summary: {
    notes: string[];
    substitutions: Array<{ ingredientId?: string; text: string }>;
    problems: string[];
    rating?: number;
    reviewNote?: string;
  };
  startedAt: Date;
  completedAt?: Date;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICookingSessionEvent extends Document {
  user: string;
  sessionId: string;
  stepIndex?: number;
  event: CookingSessionEvent;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISavedRecipe extends Document {
  user: string;
  title: string;
  documentType: CookingDocumentType;
  shortDescription?: string;
  illustrationUrl?: string;
  illustrationData?: Buffer;
  illustrationContentType?: string;
  illustrationThumbnail?: Buffer;
  illustrationStatus?: SavedRecipe['illustrationStatus'];
  illustrationModel?: string;
  documentMarkdown: string;
  saveList: SavedRecipe['saveList'];
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
  sourceDraftId?: string;
  categorization?: SavedRecipe['categorization'];
  categorizationStatus: RecipeCategorizationStatus;
  categorizationVersion: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
