import type { Document } from 'mongoose';
import type {
  CookingDraftStatus,
  CookingDocumentType,
  StructuredRecipe,
  SavedRecipe,
  SocialImport,
  SocialPlaylistSubscription,
  SocialTranscript,
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
  illustrationSource?: 'imported' | 'generated';
  illustrationSourceVersion?: number;
  documentMarkdown: string;
  saveList: SavedRecipe['saveList'];
  collections: string[];
  favorite: boolean;
  pinned: boolean;
  personalNotes?: string;
  workspaceState?: SavedRecipe['workspaceState'];
  lastCookedAt?: Date;
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
  sourceDraftId?: string;
  sourceUrl?: string;
  categorization?: SavedRecipe['categorization'];
  categorizationStatus: RecipeCategorizationStatus;
  categorizationAttempts?: number;
  categorizationVersion: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRecipeTombstone extends Document {
  deletedAt: Date;
  recipeId: string;
  state: 'pending' | 'committed';
  tenantId?: string;
  user: string;
}

export interface ISocialImportTombstone extends Document {
  deletedAt: Date;
  importId: string;
  state: 'pending' | 'committed';
  tenantId?: string;
  user: string;
}

export interface ISocialImport extends Document {
  user: string;
  sourceUrl: string;
  canonicalUrl: string;
  provider: SocialImport['provider'];
  providerContentId?: string;
  creatorName?: string;
  creatorUrl?: string;
  title?: string;
  thumbnailUrl?: string;
  thumbnailData?: Buffer;
  thumbnailContentType?: string;
  thumbnailThumbnail?: Buffer;
  thumbnailIngestedAt?: Date;
  thumbnailIngestError?: string;
  userSuppliedText?: string;
  extractedText?: string;
  extractedAt?: Date;
  draftId?: string;
  draftConversationId?: string;
  embedHtmlAllowed: boolean;
  status: SocialImport['status'];
  reviewMessage?: string;
  draftSummary?: string;
  savedRecipeId?: string;
  provenance: SocialImport['provenance'];
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISocialImportJob extends Document {
  user: string;
  socialImportId: string;
  provider?: SocialImport['provider'];
  providerContentId?: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  stage: string;
  attemptCount: number;
  activeKey?: 'active';
  lastErrorCode?: string;
  lastErrorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISocialTranscript extends Document {
  provider: SocialTranscript['provider'];
  providerContentId: string;
  status: SocialTranscript['status'];
  source: SocialTranscript['source'];
  text?: string;
  language?: string;
  failureReason?: string;
  lastErrorMessage?: string;
  attemptCount: number;
  lastAttemptedAt?: Date;
  nextAttemptAt?: Date;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISocialPlaylistSubscription extends Document {
  user: string;
  provider: SocialPlaylistSubscription['provider'];
  playlistId: string;
  sourceUrl: string;
  title?: string;
  status: SocialPlaylistSubscription['status'];
  importCount: number;
  lastSyncedAt?: Date;
  nextSyncAt?: Date;
  lastErrorMessage?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IGuestLimit extends Document<string> {
  count: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
