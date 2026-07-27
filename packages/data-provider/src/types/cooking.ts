export type CookingQuantityType = 'measured' | 'estimated' | 'to_taste';

export type CookingTimer = {
  id: string;
  label: string;
  durationSeconds: number;
};

export type CookingTemperature = {
  value: number;
  unit: 'F' | 'C';
  appliance?: string;
};

export type Ingredient = {
  id: string;
  originalText: string;
  quantity?: number;
  unit?: string;
  item: string;
  preparation?: string;
  group?: string;
  optional?: boolean;
  quantityType: CookingQuantityType;
};

export type RecipeStep = {
  id: string;
  order: number;
  text: string;
  ingredientIds: string[];
  timers: CookingTimer[];
  temperature?: CookingTemperature;
  warnings: string[];
  tips: string[];
};

export type StructuredRecipe = {
  title: string;
  description: string;
  servings: number;
  timing: {
    prepMinutes: number;
    cookMinutes: number;
    totalMinutes: number;
  };
  difficulty?: RecipeDifficulty;
  equipment?: string[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  notes: string[];
  tags: string[];
};

export type CookingDraftStatus = 'active' | 'archived';
export type CookingDocumentType = 'recipe' | 'guide' | 'prep_plan';
export const CookingChatCategories = [
  'ideas',
  'recipes',
  'saved_recipe',
  'adjustments',
  'cooking_help',
] as const;
export type CookingChatCategory = (typeof CookingChatCategories)[number];
export type RecipeCategorizationStatus = 'pending' | 'processing' | 'complete' | 'failed';
export type RecipeIllustrationStatus = 'pending' | 'generating' | 'complete' | 'failed';
export type RecipeDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type RecipeTimeBucket = 'under_15' | 'under_30' | 'under_60' | 'long_cook';
export type SavedRecipeList = 'want_to_cook' | 'cooked_already';
export type SavedRecipeSort =
  | 'recently_updated'
  | 'recently_saved'
  | 'recently_cooked'
  | 'title'
  | 'quickest';

export type CookingDocument = {
  _id: string;
  user: string;
  conversationId?: string;
  prompt: string;
  status: CookingDraftStatus;
  documentType: CookingDocumentType;
  selected: boolean;
  documentMarkdown?: string;
  recipe: StructuredRecipe;
  adjustments?: string[];
  sourceUrl?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** Compatibility name for clients still consuming the draft endpoints. */
export type CookingDraft = CookingDocument;

export type ConversationCookingDocuments = {
  documents: CookingDocument[];
  selectedDocumentId?: string;
};

export type RecipeCategorization = {
  cuisine: string[];
  mealType: string[];
  dishType: string[];
  diet: string[];
  difficulty?: RecipeDifficulty;
  timeBucket?: RecipeTimeBucket;
  occasion: string[];
  equipment: string[];
  potentialAllergens: string[];
  evidence?: RecipeMetadataEvidence[];
  mainIngredients: string[];
  techniques: string[];
  flavorProfile: string[];
  confidence?: number;
  source: 'llm' | 'hybrid';
  model?: string;
  updatedAt: string;
};

export type RecipeMetadataEvidence = {
  value: string;
  kind?: 'diet' | 'equipment' | 'allergen';
  source: 'source' | 'llm' | 'ingredient_rules' | 'instruction_rules';
  confidence: number;
};

export type SavedRecipe = {
  _id: string;
  user: string;
  title: string;
  documentType: CookingDocumentType;
  shortDescription?: string;
  illustrationUrl?: string;
  illustrationStatus?: RecipeIllustrationStatus;
  illustrationModel?: string;
  documentMarkdown: string;
  saveList: SavedRecipeList;
  collections: string[];
  favorite: boolean;
  pinned: boolean;
  personalNotes?: string;
  lastCookedAt?: string;
  recipe?: StructuredRecipe;
  yield?: string;
  sourceConversationId?: string;
  sourceDraftId?: string;
  sourceUrl?: string;
  categorization?: RecipeCategorization;
  categorizationStatus: RecipeCategorizationStatus;
  categorizationAttempts?: number;
  categorizationVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedRecipeSummary = Omit<SavedRecipe, 'documentMarkdown' | 'recipe'> & {
  servings?: number;
  totalMinutes?: number;
};

export type CookingChatMessageMetadata = {
  cookingPromptSuggestions?: string[];
  cookingWebSources?: CookingWebSource[];
  cookingActiveIntent?: string;
  cookingActiveAction?: string;
  cookingCategory?: CookingChatCategory;
};

export type CookingWebSource = {
  title?: string;
  url: string;
  sourceType: 'search' | 'page' | 'recipe' | 'video' | 'product' | 'safety';
  accessedAt: string;
};

export type CookingChatMessage = {
  messageId: string;
  conversationId: string | null;
  parentMessageId: string | null;
  text: string;
  isCreatedByUser: boolean;
  error?: boolean;
  metadata?: CookingChatMessageMetadata;
  createdAt?: string;
  files?: import('./files').TFile[];
};

export type CookingChatConversation = {
  conversationId: string;
  title?: string | null;
  endpoint?: string | null;
  model?: string | null;
  cookingCategory?: CookingChatCategory;
};

export type CookingChatRequest = {
  text: string;
  conversationId?: string;
  messageId: string;
  responseMessageId: string;
  parentMessageId: string;
  messages: CookingChatMessage[];
  files?: import('./files').TFile[];
};

export type CookingChatStreamEvent =
  | { message: CookingChatMessage; created: true; cooking: true }
  | {
      message: true;
      text: string;
      messageId: string;
      parentMessageId: string;
      conversationId: string;
    }
  | {
      type: 'step';
      step: CookingChatProgress;
      messageId: string;
      parentMessageId: string;
      conversationId: string;
    }
  | {
      final: true;
      conversation: CookingChatConversation;
      title?: string;
      requestMessage: CookingChatMessage;
      responseMessage: CookingChatMessage;
      cookingDraftUpdated?: boolean;
      cookingDocumentsUpdated?: boolean;
    };

export type CookingChatState = {
  messages: CookingChatMessage[];
  conversation?: CookingChatConversation;
  isStreaming: boolean;
  activeStep?: CookingChatProgress;
  documentsUpdated: boolean;
};

export type CookingChatProgressValue =
  | string
  | number
  | boolean
  | null
  | CookingChatProgressValue[]
  | { [key: string]: CookingChatProgressValue };

export type CookingChatProgress = {
  type: string;
  payload: { [key: string]: CookingChatProgressValue };
};

export type GenerateCookingDraftRequest = {
  prompt: string;
  conversationId?: string;
  documentType?: CookingDocumentType;
  documentMarkdown?: string;
  recipe?: StructuredRecipe;
};

export type UpdateCookingDraftRequest = {
  recipe?: StructuredRecipe;
  documentMarkdown?: string;
};

export type CreateCookingDocumentRequest = GenerateCookingDraftRequest & {
  savedRecipeId?: string;
};

export type UpdateCookingDocumentRequest = UpdateCookingDraftRequest;

export type CookingVoiceConfig = {
  enabled: boolean;
  sessionUrl?: string;
  shareRecipeContext: boolean;
};

export type CookingVoiceSessionGrant = {
  connect_url: string;
  expires_at: string;
  token: string;
};

export type PersistCookingVoiceTurnRequest = {
  conversationId: string;
  turnId: string;
  userText: string;
  assistantText: string;
};

export type PersistCookingVoiceTurnResponse = {
  userMessageId: string;
  assistantMessageId: string;
};

export type SaveRecipeRequest = {
  title?: string;
  documentType?: CookingDocumentType;
  shortDescription?: string;
  documentMarkdown: string;
  saveList?: SavedRecipeList;
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
  sourceDraftId?: string;
};

export type UpdateSavedRecipeRequest = {
  title?: string;
  documentType?: CookingDocumentType;
  shortDescription?: string;
  documentMarkdown?: string;
  saveList?: SavedRecipeList;
  collections?: string[];
  favorite?: boolean;
  pinned?: boolean;
  personalNotes?: string;
  recipe?: StructuredRecipe;
};

export type SavedRecipesQuery = {
  q?: string;
  cuisine?: string;
  mealType?: string;
  diet?: string;
  timeBucket?: RecipeTimeBucket;
  mainIngredient?: string;
  equipment?: string;
  documentType?: CookingDocumentType;
  saveList?: SavedRecipeList;
  collection?: string;
  favorite?: boolean | string;
  pinned?: boolean | string;
  difficulty?: RecipeDifficulty | string;
  sort?: SavedRecipeSort;
  limit?: number;
  cursor?: string;
};

export type RecipeFacetOption = {
  value: string;
  count: number;
};

export type SavedRecipeFacetsResponse = {
  total: number;
  documentType: RecipeFacetOption[];
  cuisine: RecipeFacetOption[];
  mealType: RecipeFacetOption[];
  diet: RecipeFacetOption[];
  difficulty: RecipeFacetOption[];
  timeBucket: RecipeFacetOption[];
  mainIngredient: RecipeFacetOption[];
  equipment: RecipeFacetOption[];
  collection: RecipeFacetOption[];
};

export type SavedRecipesResponse = {
  recipes: SavedRecipeSummary[];
  total: number;
  nextCursor?: string;
};

export type OfflineRecipesResponse = {
  recipes: SavedRecipe[];
  syncedAt: string;
  nextCursor?: string;
};

export type PublicRecipeAuthor = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
};

export type PublicRecipeSummary = Pick<
  SavedRecipeSummary,
  | '_id'
  | 'title'
  | 'documentType'
  | 'shortDescription'
  | 'illustrationUrl'
  | 'illustrationStatus'
  | 'categorization'
  | 'servings'
  | 'yield'
  | 'updatedAt'
> & { author: PublicRecipeAuthor };

export type PublicRecipe = PublicRecipeSummary & Pick<SavedRecipe, 'documentMarkdown' | 'recipe'>;

export type PublicRecipesResponse = {
  recipes: PublicRecipeSummary[];
};

export type SocialImportProvider = 'youtube' | 'instagram' | 'tiktok' | 'web' | 'unknown';

export type SocialImportStatus =
  | 'saved'
  | 'processing'
  | 'draft_ready'
  | 'needs_review'
  | 'saved_recipe'
  | 'inspiration'
  | 'failed';

export type SocialImportProvenance =
  | 'source_exact'
  | 'creator_verified'
  | 'rekky_estimated'
  | 'user_edited'
  | 'unknown';

export type SocialImportJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';
export type SocialTranscriptStatus = 'found' | 'not_available' | 'temporarily_failed';
export type SocialTranscriptSource =
  | 'creator_authorized_caption'
  | 'experimental_ytdlp'
  | 'user_pasted'
  | 'unknown';
export type SocialPlaylistSubscriptionStatus = 'active' | 'paused' | 'failed';

export type SocialImport = {
  _id: string;
  user: string;
  sourceUrl: string;
  canonicalUrl: string;
  provider: SocialImportProvider;
  providerContentId?: string;
  creatorName?: string;
  creatorUrl?: string;
  title?: string;
  thumbnailUrl?: string;
  thumbnailAssetAvailable?: boolean;
  userSuppliedText?: string;
  extractedText?: string;
  extractedAt?: string;
  draftId?: string;
  draftConversationId?: string;
  embedHtmlAllowed: boolean;
  status: SocialImportStatus;
  reviewMessage?: string;
  draftSummary?: string;
  savedRecipeId?: string;
  provenance: SocialImportProvenance;
  createdAt: string;
  updatedAt: string;
};

export type CreateSocialImportRequest = {
  sourceUrl: string;
  title?: string;
  userSuppliedText?: string;
};

export type UpdateSocialImportRequest = {
  status?: SocialImportStatus;
  title?: string;
  creatorName?: string;
  userSuppliedText?: string;
  draftSummary?: string;
  savedRecipeId?: string;
};

export type CreateSocialImportDraftRequest = {
  userSuppliedText?: string;
};

export type SocialImportDraftResponse = {
  socialImport: SocialImport;
  draft: CookingDocument;
};

export type SocialImportJob = {
  _id: string;
  user: string;
  socialImportId: string;
  provider?: SocialImportProvider;
  providerContentId?: string;
  status: SocialImportJobStatus;
  stage: string;
  attemptCount: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SocialTranscript = {
  _id: string;
  provider: SocialImportProvider;
  providerContentId: string;
  status: SocialTranscriptStatus;
  source: SocialTranscriptSource;
  text?: string;
  language?: string;
  failureReason?: string;
  lastErrorMessage?: string;
  attemptCount: number;
  lastAttemptedAt?: string;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SocialPlaylistSubscription = {
  _id: string;
  user: string;
  provider: 'youtube';
  playlistId: string;
  sourceUrl: string;
  title?: string;
  status: SocialPlaylistSubscriptionStatus;
  importCount: number;
  lastSyncedAt?: string;
  nextSyncAt?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateSocialPlaylistSubscriptionRequest = {
  sourceUrl: string;
};

export type UpdateSocialPlaylistSubscriptionRequest = {
  status?: SocialPlaylistSubscriptionStatus;
};

export type SocialPlaylistSubscriptionResponse = {
  subscription: SocialPlaylistSubscription;
  importsCreated: number;
};

export type SocialPlaylistSubscriptionsResponse = {
  subscriptions: SocialPlaylistSubscription[];
};

export type SocialImportsQuery = {
  q?: string;
  provider?: SocialImportProvider;
  status?: SocialImportStatus;
  view?: 'all' | 'ready' | 'needs_help' | 'processing' | 'saved';
  limit?: number;
  cursor?: string;
};

export type SocialImportsResponse = {
  imports: SocialImport[];
  total: number;
  nextCursor?: string;
};

export type SocialImportJobsResponse = {
  jobs: SocialImportJob[];
};
