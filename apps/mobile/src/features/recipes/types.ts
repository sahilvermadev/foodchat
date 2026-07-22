export type RecipeCategorization = {
  cuisine?: string[];
  mealType?: string[];
  dishType?: string[];
  diet?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  timeBucket?: 'under_15' | 'under_30' | 'under_60' | 'long_cook';
  occasion?: string[];
  equipment?: string[];
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
  categorization?: RecipeCategorization;
  servings?: number;
  saveList: 'want_to_cook' | 'cooked_already';
  updatedAt: string;
};

export type StructuredRecipe = {
  title: string;
  description: string;
  servings: number;
  timing: { prepMinutes: number; cookMinutes: number; totalMinutes: number };
  ingredients: Array<{ id: string; originalText: string }>;
  steps: Array<{ id: string; order: number; text: string }>;
  notes: string[];
  tags: string[];
};

export type RecipeDetail = RecipeSummary & {
  documentMarkdown: string;
  recipe?: StructuredRecipe;
  sourceConversationId?: string;
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

export type PublicRecipeSummary = Omit<RecipeSummary, 'saveList'> & {
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
};
