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
  ingredients: Ingredient[];
  steps: RecipeStep[];
  notes: string[];
  tags: string[];
};

export type CookingDraftStatus = 'active' | 'archived';
export type CookingDocumentType = 'recipe' | 'guide' | 'prep_plan';
export type CookingSessionStatus = 'active' | 'completed';
export type RecipeCategorizationStatus = 'pending' | 'complete' | 'failed';
export type RecipeIllustrationStatus = 'pending' | 'generating' | 'complete' | 'failed';
export type RecipeDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type RecipeTimeBucket = 'under_15' | 'under_30' | 'under_60' | 'long_cook';

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
  mainIngredients: string[];
  techniques: string[];
  flavorProfile: string[];
  confidence?: number;
  source: 'llm';
  model?: string;
  updatedAt: string;
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
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
  sourceDraftId?: string;
  categorization?: RecipeCategorization;
  categorizationStatus: RecipeCategorizationStatus;
  categorizationVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedRecipeSummary = Omit<SavedRecipe, 'documentMarkdown' | 'recipe'> & {
  servings?: number;
};

export type CookingSession = {
  _id: string;
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
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CookingNavigationEvent = {
  type: 'navigation';
  action: 'previous' | 'next' | 'jump' | 'repeat';
  stepIndex?: number;
};

export type CookingSessionNoteEvent = {
  type: 'note';
  stepIndex?: number;
  text: string;
};

export type CookingSubstitutionEvent = {
  type: 'substitution';
  stepIndex?: number;
  ingredientId?: string;
  text: string;
};

export type CookingTimerEvent = {
  type: 'timer';
  stepIndex?: number;
  timerId: string;
  action: 'started' | 'completed';
  durationSeconds?: number;
};

export type CookingProblemEvent = {
  type: 'problem';
  stepIndex?: number;
  text: string;
};

export type CookingReviewEvent = {
  type: 'review';
  rating: number;
  note: string;
};

export type CookingSessionEvent =
  | CookingNavigationEvent
  | CookingSessionNoteEvent
  | CookingSubstitutionEvent
  | CookingTimerEvent
  | CookingProblemEvent
  | CookingReviewEvent;

export type GenerateCookingDraftRequest = {
  prompt: string;
  conversationId?: string;
  documentType?: CookingDocumentType;
  documentMarkdown?: string;
};

export type UpdateCookingDraftRequest = {
  recipe?: StructuredRecipe;
  documentMarkdown?: string;
};

export type CreateCookingDocumentRequest = GenerateCookingDraftRequest;

export type UpdateCookingDocumentRequest = UpdateCookingDraftRequest;

export type StartCookingSessionRequest = {
  draftId: string;
};

export type CompleteCookingSessionRequest = {
  rating: number;
  note: string;
};

export type SaveRecipeRequest = {
  title?: string;
  documentType?: CookingDocumentType;
  shortDescription?: string;
  documentMarkdown: string;
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
  sourceDraftId?: string;
};

export type UpdateSavedRecipeRequest = {
  title?: string;
  documentType?: CookingDocumentType;
  shortDescription?: string;
  documentMarkdown?: string;
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
  limit?: number;
  cursor?: string;
};

export type SavedRecipesResponse = {
  recipes: SavedRecipeSummary[];
  nextCursor?: string;
};
