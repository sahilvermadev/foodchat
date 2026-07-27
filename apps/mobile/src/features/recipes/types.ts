import type { StructuredRecipe } from 'librechat-data-provider';

export type { StructuredRecipe } from 'librechat-data-provider';

export type RecipeCategorization = {
  cuisine?: string[];
  mealType?: string[];
  dishType?: string[];
  diet?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  timeBucket?: 'under_15' | 'under_30' | 'under_60' | 'long_cook';
  occasion?: string[];
  equipment?: string[];
  potentialAllergens?: string[];
  mainIngredients?: string[];
  techniques?: string[];
  flavorProfile?: string[];
};

export type RecipeSummary = {
  _id: string;
  title: string;
  documentType: 'recipe' | 'guide' | 'prep_plan';
  shortDescription?: string;
  illustrationUrl?: string;
  illustrationStatus: 'pending' | 'generating' | 'complete' | 'failed';
  categorizationStatus?: 'pending' | 'processing' | 'complete' | 'failed';
  categorizationAttempts?: number;
  categorization?: RecipeCategorization;
  servings?: number;
  yield?: string;
  totalMinutes?: number;
  saveList: 'want_to_cook' | 'cooked_already';
  collections: string[];
  favorite: boolean;
  pinned: boolean;
  personalNotes?: string;
  lastCookedAt?: string;
  sourceUrl?: string;
  updatedAt: string;
};

export type RecipeDetail = RecipeSummary & {
  documentMarkdown: string;
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
};

export type RecipeSort =
  | 'recently_updated'
  | 'recently_saved'
  | 'recently_cooked'
  | 'title'
  | 'quickest';

export type RecipeFacetOption = { value: string; count: number };

export type RecipeFacets = {
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

export type RecipesResponse = {
  recipes: RecipeSummary[];
  total: number;
  nextCursor?: string;
};

export type PublicRecipeAuthor = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
};

export type PublicRecipeSummary = Omit<
  RecipeSummary,
  | 'saveList'
  | 'collections'
  | 'favorite'
  | 'pinned'
  | 'lastCookedAt'
  | 'sourceUrl'
  | 'totalMinutes'
> & {
  author: PublicRecipeAuthor;
};

export type PublicRecipeDetail = PublicRecipeSummary & {
  documentMarkdown: string;
  recipe?: StructuredRecipe;
};

export type PublicRecipesResponse = { recipes: PublicRecipeSummary[] };

export type RecipeFilters = {
  q?: string;
  documentType?: 'recipe' | 'guide' | 'prep_plan';
  saveList?: 'want_to_cook' | 'cooked_already';
  cuisine?: string;
  diet?: string;
  mealType?: string;
  timeBucket?: string;
  mainIngredient?: string;
  equipment?: string;
  collection?: string;
  favorite?: string;
  pinned?: string;
  difficulty?: string;
  sort?: RecipeSort;
};
