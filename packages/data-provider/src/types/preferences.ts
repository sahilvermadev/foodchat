export type PreferencesDocument = {
  _id: string;
  user: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdatePreferencesRequest = {
  markdown: string;
};

export type PreferencesChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type DeviceLocationContext = {
  locale?: string;
  languages?: string[];
  timeZone?: string;
  measurementSystem?: 'metric' | 'imperial';
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    source: 'browser_geolocation';
    permission?: 'granted' | 'prompt' | 'denied' | 'unavailable';
  };
};

export type PreferencesChatRequest = {
  message?: string;
  model?: string;
  history?: PreferencesChatHistoryMessage[];
  deviceContext?: DeviceLocationContext;
};

export type PreferencesChatResponse = {
  text: string;
  preferences: PreferencesDocument;
  preferencesChanged: boolean;
  changedHeadings: string[];
  suggestions?: Array<{ text: string; display: string }>;
  complete?: boolean;
};

export type GenerativePromptEnvironmentalContext = {
  current_time: string;
  day_of_week: string;
  current_month: string;
  timezone?: string;
  locale?: string;
  season?: string;
};

export type GenerativePromptsRequest = {
  environmental_context: GenerativePromptEnvironmentalContext;
};

export type GenerativePromptAction = {
  action: 'SET_INPUT';
  params: {
    prompt_injection: string;
  };
  preventDefault?: boolean;
};

export type GenerativePromptElement =
  | {
      type: 'SuggestionList';
      props: {
        label?: string;
      };
      children: string[];
      on?: Record<string, never>;
    }
  | {
      type: 'SuggestionLink';
      props: {
        text: string;
        title: string;
        slot: 'efficient' | 'seasonal' | 'experimental';
      };
      children: string[];
      on: {
        click: GenerativePromptAction;
      };
    };

export type GenerativePromptSpec = {
  root: string;
  elements: Record<string, GenerativePromptElement>;
};

export type SpecialtyIngredientCategory =
  | 'Condiments & Sauces'
  | 'Cheese & Dairy'
  | 'Preserved & Pickled'
  | 'Freezer'
  | 'Meat & Protein'
  | 'Other';

export type SpecialtyIngredientImageStatus = 'pending' | 'generating' | 'ready' | 'failed';

export type SpecialtyIngredientCatalogItem = {
  _id: string;
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  category: SpecialtyIngredientCategory;
  aliases: string[];
  imageStatus: SpecialtyIngredientImageStatus;
  imageUrl?: string;
  imagePrompt?: string;
  imageStyle: string;
  createdAt: string;
  updatedAt: string;
};

export type SpecialtyIngredientCatalogResponse = {
  ingredients: SpecialtyIngredientCatalogItem[];
};

export type ResolveSpecialtyIngredientRequest = {
  name: string;
  category?: SpecialtyIngredientCategory;
};
