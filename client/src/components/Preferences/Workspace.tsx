import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChefHat,
  Eye,
  Heart,
  ImageIcon,
  Landmark,
  Leaf,
  MapPin,
  Plus,
  Save,
  Search,
  SendHorizontal,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Utensils,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Spinner } from '@librechat/client';
import type {
  DeviceLocationContext,
  PreferencesChatHistoryMessage,
  SpecialtyIngredientCatalogItem,
  SpecialtyIngredientCategory,
} from 'librechat-data-provider';
import type { ReactNode, RefObject } from 'react';
import {
  usePreferenceIngredientsQuery,
  usePreferencesChatMutation,
  usePreferencesQuery,
  useResolvePreferenceIngredientMutation,
  useUpdatePreferencesMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { cn } from '~/utils';
import { ProtectedImage } from '~/components/ui';
import {
  SPECIALTY_INGREDIENT_CATEGORIES,
  cleanPreferenceLine,
  inferSpecialtyIngredientCategory,
  preferenceSections,
  replacePreferenceSection,
} from './artifact';
import type { PreferenceHeading, PreferenceSection } from './artifact';

type ThreadMessage = PreferencesChatHistoryMessage & {
  id: string;
};

type Localize = ReturnType<typeof useLocalize>;

type HeadingConfig = {
  heading: PreferenceHeading;
  icon: typeof ShieldCheck;
};

type KitchenDisplayGroup = {
  labelKey: TranslationKeys;
  items: string[];
};

type ProfileDrafts = Map<PreferenceHeading, string[]>;

const atAGlanceHeadings: HeadingConfig[] = [
  { heading: 'Diet', icon: Leaf },
  { heading: 'Safety', icon: TriangleAlert },
  { heading: 'Religious & Cultural Rules', icon: Landmark },
  { heading: 'Kitchen', icon: Utensils },
  { heading: 'Household', icon: Users },
  { heading: 'Location', icon: MapPin },
  { heading: 'Taste', icon: Heart },
  { heading: 'Cooking Level', icon: BarChart3 },
  { heading: 'Goals', icon: ChefHat },
  { heading: 'Personal Context', icon: UserRound },
];

const categoryLabels: Record<SpecialtyIngredientCategory, TranslationKeys> = {
  'Condiments & Sauces': 'com_preferences_category_condiments',
  'Cheese & Dairy': 'com_preferences_category_dairy',
  'Preserved & Pickled': 'com_preferences_category_preserved',
  Freezer: 'com_preferences_category_freezer',
  'Meat & Protein': 'com_preferences_category_protein',
  Other: 'com_preferences_category_other',
};

const exampleIngredients = ['miso', 'capers', 'gochujang', 'preserved lemons'];
const imperialRegions = new Set(['US', 'LR', 'MM']);
const ingredientQuantityPrefixes = new Set([
  'a',
  'an',
  'the',
  'of',
  'some',
  'jar',
  'jars',
  'bottle',
  'bottles',
  'packet',
  'packets',
  'pack',
  'packs',
  'tin',
  'tins',
  'can',
  'cans',
  'sprig',
  'sprigs',
  'block',
  'blocks',
  'wedge',
  'wedges',
  'bag',
  'bags',
  'box',
  'boxes',
  'tub',
  'tubs',
]);
const ingredientAliases = new Map([
  ['gochujang paste', 'gochujang'],
  ['korean chili paste', 'gochujang'],
  ['korean chilli paste', 'gochujang'],
  ['miso paste', 'miso'],
  ['fish sauce bottle', 'fish sauce'],
  ['cheddar cheese', 'cheddar'],
  ['mozzarella cheese', 'mozzarella'],
  ['preserved lemon', 'preserved lemons'],
]);

function normalizedIngredientText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function catalogLookupKeysForName(value: string): string[] {
  const normalized = normalizedIngredientText(value);
  const nameParts = normalized.split(' ');
  while (nameParts.length > 1 && ingredientQuantityPrefixes.has(nameParts[0])) {
    nameParts.shift();
  }
  const withoutQuantity = nameParts.join(' ').trim();
  const aliased = ingredientAliases.get(withoutQuantity) ?? withoutQuantity;
  return Array.from(new Set([normalized, withoutQuantity, aliased].filter(Boolean)));
}

function catalogLookupKeysForItem(ingredient: SpecialtyIngredientCatalogItem): string[] {
  return Array.from(
    new Set(
      [
        ingredient.displayName,
        ingredient.canonicalName,
        ingredient.normalizedName,
        ...ingredient.aliases,
      ].flatMap(catalogLookupKeysForName),
    ),
  );
}

function catalogItemForName(
  catalogByName: Map<string, SpecialtyIngredientCatalogItem>,
  name: string,
): SpecialtyIngredientCatalogItem | undefined {
  return catalogLookupKeysForName(name)
    .map((key) => catalogByName.get(key))
    .find(Boolean);
}

function messageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function regionFromLocale(locale?: string): string | undefined {
  const parts = locale?.split('-') ?? [];
  return parts.length > 1 ? parts[parts.length - 1]?.toUpperCase() : undefined;
}

function measurementSystem(locale?: string): DeviceLocationContext['measurementSystem'] {
  return imperialRegions.has(regionFromLocale(locale) ?? '') ? 'imperial' : 'metric';
}

function baseDeviceContext(): DeviceLocationContext {
  const locale = navigator.language;
  const languages = Array.from(navigator.languages ?? []).slice(0, 5);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    ...(locale ? { locale } : {}),
    ...(languages.length ? { languages } : {}),
    ...(timeZone ? { timeZone } : {}),
    measurementSystem: measurementSystem(locale),
  };
}

function useDeviceLocationContext(enabled: boolean): {
  context: DeviceLocationContext;
  ready: boolean;
} {
  const [state, setState] = useState<{ context: DeviceLocationContext; ready: boolean }>(() => ({
    context: baseDeviceContext(),
    ready: false,
  }));

  useEffect(() => {
    if (!enabled || state.ready) {
      return;
    }
    let active = true;
    const finish = (context: DeviceLocationContext) => {
      if (active) {
        setState({ context, ready: true });
      }
    };
    const fallbackTimer = window.setTimeout(() => finish(baseDeviceContext()), 1800);

    if (!navigator.geolocation) {
      window.clearTimeout(fallbackTimer);
      finish(baseDeviceContext());
      return () => {
        active = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(fallbackTimer);
        finish({
          ...baseDeviceContext(),
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            source: 'browser_geolocation',
            permission: 'granted',
          },
        });
      },
      () => {
        window.clearTimeout(fallbackTimer);
        finish(baseDeviceContext());
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 1500 },
    );

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
    };
  }, [enabled, state.ready]);

  return state;
}

function sectionByHeading(
  sections: PreferenceSection[],
  heading: PreferenceHeading,
): PreferenceSection {
  return sections.find((section) => section.heading === heading) ?? { heading, lines: [] };
}

function sentenceCase(value: string): string {
  const clean = value.trim().replace(/\.$/, '');
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : clean;
}

function splitKitchenItems(value: string): string[] {
  return value
    .replace(/\.$/, '')
    .split(/,\s+|\s+and\s+/)
    .map(sentenceCase)
    .filter(Boolean);
}

function kitchenDisplayGroups(lines: string[]): KitchenDisplayGroup[] {
  const groups = {
    appliances: [] as string[],
    cooking: [] as string[],
    tools: [] as string[],
    unavailable: [] as string[],
  };

  lines.map(cleanPreferenceLine).forEach((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('appliances:')) {
      groups.appliances.push(...splitKitchenItems(line.replace(/^appliances:\s*/i, '')));
      return;
    }
    if (lower.startsWith('no ')) {
      groups.unavailable.push(sentenceCase(line.replace(/^no\s+/i, 'No ')));
      return;
    }
    if (/\b(stove|cooktop|burner|oven|bbq|grill)\b/i.test(line)) {
      groups.cooking.push(sentenceCase(line));
      return;
    }
    groups.tools.push(sentenceCase(line.replace(/^owner of\s+/i, '')));
  });

  const displayGroups: KitchenDisplayGroup[] = [
    { labelKey: 'com_preferences_kitchen_group_cooking', items: groups.cooking },
    { labelKey: 'com_preferences_kitchen_group_appliances', items: groups.appliances },
    { labelKey: 'com_preferences_kitchen_group_tools', items: groups.tools },
    { labelKey: 'com_preferences_kitchen_group_unavailable', items: groups.unavailable },
  ];

  return displayGroups.filter((group) => group.items.length > 0);
}

function KitchenPreferenceSummary({ lines, localize }: { lines: string[]; localize: Localize }) {
  const groups = kitchenDisplayGroups(lines);
  const visibleBudget = 10;
  let used = 0;

  return (
    <div className="mt-3 space-y-3">
      {groups.map((group) => {
        const remaining = visibleBudget - used;
        const visible = group.items.slice(0, Math.max(remaining, 0));
        used += visible.length;
        if (visible.length === 0) {
          return null;
        }

        const hiddenCount = group.items.length - visible.length;
        return (
          <div key={group.labelKey}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-normal text-text-secondary">
              {localize(group.labelKey)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {visible.map((item) => (
                <span
                  key={`${group.labelKey}:${item}`}
                  className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs leading-4 text-text-secondary"
                >
                  {item}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="rounded-full border border-border-light bg-surface-secondary px-2.5 py-1 text-xs leading-4 text-text-secondary">
                  {localize('com_preferences_more_count').replace('{count}', String(hiddenCount))}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function profileDraftsFromSections(sections: PreferenceSection[]): ProfileDrafts {
  return new Map(
    atAGlanceHeadings.map(({ heading }) => {
      const lines = sectionByHeading(sections, heading).lines.map(cleanPreferenceLine);
      return [heading, lines.length > 0 ? lines : ['']];
    }),
  );
}

function sectionInputLabel(localize: Localize, heading: PreferenceHeading, index: number): string {
  return localize('com_preferences_detail_label')
    .replace('{section}', heading)
    .replace('{number}', String(index + 1));
}

function PreferenceSectionEditor({
  heading,
  lines,
  isSaving,
  localize,
  onChange,
  onAdd,
  onRemove,
}: {
  heading: PreferenceHeading;
  lines: string[];
  isSaving: boolean;
  localize: Localize;
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {lines.map((line, index) => (
        <div key={`${heading}:${index}`} className="flex items-center gap-1.5">
          <input
            value={line}
            disabled={isSaving}
            aria-label={sectionInputLabel(localize, heading, index)}
            className="min-w-0 flex-1 rounded-md border border-border-light bg-surface-secondary px-2.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary disabled:opacity-60"
            placeholder={localize('com_preferences_detail_placeholder')}
            onChange={(event) => onChange(index, event.target.value)}
          />
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            aria-label={localize('com_preferences_remove_detail')}
            disabled={isSaving}
            onClick={() => onRemove(index)}
          >
            <Trash2 className="icon-xs" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
        disabled={isSaving}
        onClick={onAdd}
      >
        <Plus className="icon-xs" aria-hidden="true" />
        {localize('com_preferences_add_detail')}
      </button>
    </div>
  );
}

function PreferenceCard({
  config,
  sections,
  draftLines,
  isEditing,
  isSaving,
  localize,
  onEdit,
  onLineChange,
  onAddLine,
  onRemoveLine,
}: {
  config: HeadingConfig;
  sections: PreferenceSection[];
  draftLines: string[];
  isEditing: boolean;
  isSaving: boolean;
  localize: Localize;
  onEdit: (heading: PreferenceHeading) => void;
  onLineChange: (heading: PreferenceHeading, index: number, value: string) => void;
  onAddLine: (heading: PreferenceHeading) => void;
  onRemoveLine: (heading: PreferenceHeading, index: number) => void;
}) {
  const Icon = config.icon;
  const section = sectionByHeading(sections, config.heading);
  const hasDraft = draftLines.some((line) => cleanPreferenceLine(line).length > 0);
  const isComplete = isEditing ? hasDraft : section.lines.length > 0;
  let content: ReactNode;
  if (isEditing) {
    content = (
      <PreferenceSectionEditor
        heading={config.heading}
        lines={draftLines}
        isSaving={isSaving}
        localize={localize}
        onChange={(index, value) => onLineChange(config.heading, index, value)}
        onAdd={() => onAddLine(config.heading)}
        onRemove={(index) => onRemoveLine(config.heading, index)}
      />
    );
  } else if (isComplete && config.heading === 'Kitchen') {
    content = <KitchenPreferenceSummary lines={section.lines} localize={localize} />;
  } else if (isComplete) {
    content = (
      <ul className="mt-2 space-y-1 text-sm leading-5 text-text-secondary">
        {section.lines.map((line) => (
          <li key={`${config.heading}:${line}`} className="break-words">
            {cleanPreferenceLine(line)}
          </li>
        ))}
      </ul>
    );
  } else {
    content = (
      <p className="mt-2 text-sm italic text-text-secondary">
        {localize('com_preferences_not_set')}
      </p>
    );
  }

  return (
    <article
      className={cn(
        'mb-3 inline-block w-full min-w-0 break-inside-avoid rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm',
        'transition-colors hover:border-border-medium',
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <Icon className="icon-md mt-0.5 flex-shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-xl font-normal leading-tight tracking-normal">
              {config.heading}
            </h2>
            <span
              className={cn(
                'mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-full',
                isComplete ? 'bg-green-700 text-white' : 'bg-yellow-600 text-white',
              )}
              aria-label={
                isComplete
                  ? localize('com_preferences_section_complete')
                  : localize('com_preferences_section_missing')
              }
            >
              {isComplete ? (
                <CheckCircle2 className="icon-xs" aria-hidden="true" />
              ) : (
                <span className="text-[10px] font-bold">!</span>
              )}
            </span>
          </div>
          {content}
          {!isEditing && (
            <button
              type="button"
              className="mt-3 rounded-md border border-border-light bg-surface-primary px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              onClick={() => onEdit(config.heading)}
            >
              {localize('com_ui_edit')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function AtAGlanceGrid({
  sections,
  drafts,
  isEditing,
  isSaving,
  localize,
  onEdit,
  onLineChange,
  onAddLine,
  onRemoveLine,
}: {
  sections: PreferenceSection[];
  drafts: ProfileDrafts;
  isEditing: boolean;
  isSaving: boolean;
  localize: Localize;
  onEdit: (heading: PreferenceHeading) => void;
  onLineChange: (heading: PreferenceHeading, index: number, value: string) => void;
  onAddLine: (heading: PreferenceHeading) => void;
  onRemoveLine: (heading: PreferenceHeading, index: number) => void;
}) {
  return (
    <section>
      <div className="columns-1 gap-3 md:columns-2 xl:columns-3 2xl:columns-4">
        {atAGlanceHeadings.map((config) => (
          <PreferenceCard
            key={config.heading}
            config={config}
            sections={sections}
            draftLines={drafts.get(config.heading) ?? ['']}
            isEditing={isEditing}
            isSaving={isSaving}
            localize={localize}
            onEdit={onEdit}
            onLineChange={onLineChange}
            onAddLine={onAddLine}
            onRemoveLine={onRemoveLine}
          />
        ))}
      </div>
    </section>
  );
}

function IngredientThumb({
  ingredient,
  fallbackName = '',
  compact = false,
}: {
  ingredient?: SpecialtyIngredientCatalogItem;
  fallbackName?: string;
  compact?: boolean;
}) {
  const name = ingredient?.displayName ?? fallbackName;

  if (compact) {
    return ingredient?.imageUrl ? (
      <ProtectedImage
        src={ingredient.imageUrl}
        alt=""
        className="size-10 rounded-md object-cover"
        loading="lazy"
        decoding="async"
        fallback={
          <span className="flex size-10 items-center justify-center rounded-md bg-surface-secondary text-text-secondary">
            <ImageIcon className="icon-sm" aria-hidden="true" />
          </span>
        }
      />
    ) : (
      <span className="flex size-10 items-center justify-center rounded-md bg-surface-secondary text-text-secondary">
        <ImageIcon className="icon-sm" aria-hidden="true" />
      </span>
    );
  }

  return (
    <div className="relative aspect-[5/3] bg-[#f2e8dc]">
      {ingredient?.imageUrl ? (
        <ProtectedImage
          src={ingredient.imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          fallback={
            <div className="flex size-full flex-col items-center justify-center gap-2 text-text-secondary">
              <ImageIcon className="icon-sm" aria-hidden="true" />
              <span className="max-w-[80%] truncate text-[11px] font-medium">{name}</span>
            </div>
          }
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-text-secondary">
          <ImageIcon className="icon-sm" aria-hidden="true" />
          <span className="max-w-[80%] truncate text-[11px] font-medium">{name}</span>
        </div>
      )}
    </div>
  );
}

function SpecialtyIngredientsPanel({
  ingredients,
  catalogItems,
  suggestions,
  categoryOverrides,
  draft,
  draftCategory,
  editingIngredient,
  editingName,
  editingCategory,
  isSaving,
  isResolving,
  localize,
  onDraftChange,
  onDraftCategoryChange,
  onAdd,
  onAddCatalogItem,
  onRemove,
  onEdit,
  onEditingNameChange,
  onEditingCategoryChange,
  onCancelEdit,
  onSaveEdit,
}: {
  ingredients: string[];
  catalogItems: SpecialtyIngredientCatalogItem[];
  suggestions: SpecialtyIngredientCatalogItem[];
  categoryOverrides: Map<string, SpecialtyIngredientCategory>;
  draft: string;
  draftCategory: SpecialtyIngredientCategory;
  editingIngredient: string;
  editingName: string;
  editingCategory: SpecialtyIngredientCategory;
  isSaving: boolean;
  isResolving: boolean;
  localize: Localize;
  onDraftChange: (value: string) => void;
  onDraftCategoryChange: (value: SpecialtyIngredientCategory) => void;
  onAdd: (name?: string) => void;
  onAddCatalogItem: (ingredient: SpecialtyIngredientCatalogItem) => void;
  onRemove: (ingredient: string) => void;
  onEdit: (ingredient: string) => void;
  onEditingNameChange: (value: string) => void;
  onEditingCategoryChange: (value: SpecialtyIngredientCategory) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const normalizedDraft = draft.trim().toLowerCase();
  const [isConfirmingCreate, setIsConfirmingCreate] = useState(false);
  const [areSuggestionsOpen, setAreSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const catalogByName = useMemo(() => {
    const items = new Map<string, SpecialtyIngredientCatalogItem>();
    catalogItems.forEach((ingredient) => {
      catalogLookupKeysForItem(ingredient).forEach((key) => {
        items.set(key, ingredient);
      });
    });
    return items;
  }, [catalogItems]);
  const createLabel = normalizedDraft
    ? localize('com_preferences_specialty_create').replace('{name}', draft.trim())
    : '';
  const exactSuggestion = suggestions.find(
    (ingredient) =>
      ingredient.displayName.toLowerCase() === normalizedDraft ||
      ingredient.normalizedName === normalizedDraft,
  );
  const hasExactSuggestion = Boolean(exactSuggestion);
  const shouldShowSuggestions =
    areSuggestionsOpen && normalizedDraft.length > 0 && !isConfirmingCreate;
  const shouldConfirmCreate =
    isConfirmingCreate && normalizedDraft.length > 0 && !hasExactSuggestion;

  const resetAddFlow = () => {
    setAreSuggestionsOpen(false);
    setIsConfirmingCreate(false);
    onDraftChange('');
  };

  const addExistingIngredient = (ingredient: SpecialtyIngredientCatalogItem) => {
    onAddCatalogItem(ingredient);
    resetAddFlow();
  };

  const startCreatingIngredient = () => {
    setAreSuggestionsOpen(false);
    setIsConfirmingCreate(true);
  };

  const createIngredient = () => {
    onAdd();
    resetAddFlow();
  };

  useEffect(() => {
    if (!areSuggestionsOpen && !isConfirmingCreate) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) {
        return;
      }
      setAreSuggestionsOpen(false);
      setIsConfirmingCreate(false);
      onDraftChange('');
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [areSuggestionsOpen, isConfirmingCreate, onDraftChange]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-2xl font-normal leading-tight tracking-normal">
          {localize('com_preferences_specialty_title')}
        </h2>
        <div ref={panelRef} className="relative w-full sm:max-w-sm">
          <Search
            className="icon-sm absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <label htmlFor="specialty-ingredient-input" className="sr-only">
            {localize('com_preferences_specialty_search_placeholder')}
          </label>
          <input
            id="specialty-ingredient-input"
            ref={inputRef}
            value={draft}
            className="w-full min-w-0 rounded-md border border-border-light bg-surface-primary py-2 pl-10 pr-10 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            placeholder={localize('com_preferences_specialty_search_placeholder')}
            disabled={isSaving || isResolving}
            onFocus={() => setAreSuggestionsOpen(true)}
            onChange={(event) => {
              setIsConfirmingCreate(false);
              setAreSuggestionsOpen(true);
              onDraftChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                resetAddFlow();
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (isConfirmingCreate) {
                  createIngredient();
                } else if (exactSuggestion) {
                  addExistingIngredient(exactSuggestion);
                } else {
                  startCreatingIngredient();
                }
              }
            }}
          />
          {draft.trim() && (
            <button
              type="button"
              aria-label={localize('com_preferences_specialty_clear')}
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              onClick={() => {
                resetAddFlow();
                inputRef.current?.focus();
              }}
            >
              <X className="icon-sm" aria-hidden="true" />
            </button>
          )}
          {shouldShowSuggestions && (
            <div className="absolute right-0 top-11 z-20 w-full overflow-hidden rounded-md border border-border-light bg-surface-primary shadow-lg sm:w-[26rem]">
              {suggestions.length > 0 && (
                <div className="border-b border-border-light px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {localize('com_preferences_specialty_suggestions_label')}
                </div>
              )}
              {suggestions.slice(0, 5).map((ingredient) => (
                <button
                  key={ingredient._id}
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover"
                  onClick={() => addExistingIngredient(ingredient)}
                >
                  <IngredientThumb ingredient={ingredient} compact />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ingredient.displayName}
                    </span>
                    <span className="block truncate text-xs text-text-secondary">
                      {localize(categoryLabels[ingredient.category])}
                    </span>
                  </span>
                </button>
              ))}
              {normalizedDraft && !hasExactSuggestion && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover"
                  onClick={startCreatingIngredient}
                >
                  <span className="flex size-10 items-center justify-center rounded-md bg-surface-secondary text-text-secondary">
                    <Plus className="icon-sm" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium">{createLabel}</span>
                </button>
              )}
            </div>
          )}
          {shouldConfirmCreate && (
            <div className="absolute right-0 top-11 z-20 flex w-full flex-wrap items-center gap-2 rounded-md border border-border-light bg-surface-primary p-2 shadow-lg sm:w-[28rem]">
              <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-text-primary">
                {createLabel}
              </p>
              <select
                value={draftCategory}
                className="min-w-40 rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                disabled={isSaving || isResolving}
                aria-label={localize('com_preferences_specialty_category_label')}
                onChange={(event) =>
                  onDraftCategoryChange(event.target.value as SpecialtyIngredientCategory)
                }
              >
                {SPECIALTY_INGREDIENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {localize(categoryLabels[category])}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={localize('com_preferences_specialty_add_label')}
                className="flex items-center justify-center gap-2 rounded-md bg-surface-submit px-3 py-2 text-sm font-medium text-white hover:bg-surface-submit-hover disabled:opacity-50"
                disabled={!draft.trim() || isSaving || isResolving}
                onClick={createIngredient}
              >
                {isResolving || isSaving ? (
                  <Spinner className="icon-sm" />
                ) : (
                  <Plus className="icon-sm" aria-hidden="true" />
                )}
                {localize('com_preferences_specialty_add_label')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        <AnimatePresence initial={false}>
          {ingredients.map((ingredient) => {
            const category =
              categoryOverrides.get(ingredient) ?? inferSpecialtyIngredientCategory(ingredient);
            const catalogItem = catalogItemForName(catalogByName, ingredient);
            return (
              <motion.article
                key={ingredient}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="group relative overflow-hidden rounded-lg border border-border-light bg-surface-primary shadow-sm"
              >
                <span className="absolute right-3 top-3 flex size-4 items-center justify-center rounded-full bg-green-700 text-white">
                  <CheckCircle2 className="icon-xs" aria-hidden="true" />
                </span>
                <IngredientThumb ingredient={catalogItem} fallbackName={ingredient} />
                <div className="p-3">
                  <button
                    type="button"
                    className="block w-full truncate text-left font-serif text-lg font-normal leading-tight tracking-normal text-text-primary"
                    onClick={() => onEdit(ingredient)}
                  >
                    {ingredient}
                  </button>
                  <p className="mt-1 truncate text-xs leading-4 text-text-secondary">
                    {localize(categoryLabels[category])}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={localize('com_preferences_specialty_remove')}
                  className="absolute bottom-3 right-3 flex size-7 items-center justify-center rounded-full text-text-secondary opacity-0 hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
                  disabled={isSaving}
                  onClick={() => onRemove(ingredient)}
                >
                  <Trash2 className="icon-xs" aria-hidden="true" />
                </button>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>

      {ingredients.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {exampleIngredients.map((ingredient) => (
            <button
              key={ingredient}
              type="button"
              className="rounded-full border border-border-light bg-surface-primary px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              onClick={() => {
                setAreSuggestionsOpen(true);
                onDraftChange(ingredient);
                inputRef.current?.focus();
              }}
            >
              {ingredient}
            </button>
          ))}
        </div>
      )}

      {editingIngredient && (
        <div className="mt-4 rounded-lg border border-border-light bg-surface-secondary p-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
            <input
              value={editingName}
              className="min-w-0 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              aria-label={localize('com_preferences_specialty_edit_label')}
              onChange={(event) => onEditingNameChange(event.target.value)}
            />
            <select
              value={editingCategory}
              className="rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              aria-label={localize('com_preferences_specialty_category_label')}
              onChange={(event) =>
                onEditingCategoryChange(event.target.value as SpecialtyIngredientCategory)
              }
            >
              {SPECIALTY_INGREDIENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {localize(categoryLabels[category])}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg border border-border-light px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              onClick={onCancelEdit}
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-surface-submit px-3 py-2 text-sm font-medium text-white hover:bg-surface-submit-hover disabled:opacity-50"
              disabled={!editingName.trim() || isSaving}
              onClick={onSaveEdit}
            >
              {localize('com_ui_save')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PreferencesAgentDialog({
  open,
  thread,
  draft,
  isLoading,
  localize,
  endRef,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  thread: ThreadMessage[];
  draft: string;
  isLoading: boolean;
  localize: Localize;
  endRef: RefObject<HTMLDivElement>;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 py-0 sm:items-center sm:px-3 sm:py-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-agent-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-lg border border-border-light bg-surface-primary shadow-2xl sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-light px-4 py-3">
          <div>
            <h2 id="preferences-agent-title" className="text-base font-semibold">
              {localize('com_preferences_review_action')}
            </h2>
            <p className="text-sm text-text-secondary">{localize('com_preferences_agent_hint')}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {localize('com_preferences_device_location_hint')}
            </p>
          </div>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_close')}
            onClick={onClose}
          >
            <X className="icon-sm" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-3">
            {thread.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6',
                  message.role === 'user'
                    ? 'ml-auto bg-surface-active-alt text-text-primary'
                    : 'mr-auto bg-surface-secondary text-text-primary',
                )}
              >
                {message.content}
              </div>
            ))}
            {isLoading && (
              <div className="mr-auto flex items-center gap-2 rounded-xl bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                <Spinner className="icon-sm" />
                {localize('com_preferences_agent_thinking')}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
        <div className="border-t border-border-light px-4 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-border-light bg-surface-secondary p-2">
            <label htmlFor="preferences-agent-message" className="sr-only">
              {localize('com_preferences_message_label')}
            </label>
            <textarea
              id="preferences-agent-message"
              value={draft}
              rows={2}
              className="max-h-36 min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              placeholder={localize('com_preferences_message_placeholder')}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
            />
            <button
              type="button"
              aria-label={localize('com_ui_submit')}
              className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-submit text-white hover:bg-surface-submit-hover disabled:opacity-50"
              disabled={!draft.trim() || isLoading}
              onClick={onSubmit}
            >
              <SendHorizontal className="icon-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PreferencesWorkspace() {
  const localize = useLocalize();
  const preferencesQuery = usePreferencesQuery();
  const chatMutation = usePreferencesChatMutation();
  const updatePreferencesMutation = useUpdatePreferencesMutation();
  const resolveIngredientMutation = useResolvePreferenceIngredientMutation();
  const autoResolveIngredientMutation = useResolvePreferenceIngredientMutation();
  const markdown = preferencesQuery.data?.markdown ?? '';
  const sections = useMemo(() => preferenceSections(markdown), [markdown]);
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileDrafts, setProfileDrafts] = useState<ProfileDrafts>(() =>
    profileDraftsFromSections(sections),
  );
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [specialtyDraft, setSpecialtyDraft] = useState('');
  const [specialtyDraftCategory, setSpecialtyDraftCategory] =
    useState<SpecialtyIngredientCategory>('Other');
  const [categoryOverrides, setCategoryOverrides] = useState<
    Map<string, SpecialtyIngredientCategory>
  >(() => new Map());
  const [editingIngredient, setEditingIngredient] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingCategory, setEditingCategory] = useState<SpecialtyIngredientCategory>('Other');
  const autoResolvedIngredientsRef = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement | null>(null);
  const deviceLocationContext = useDeviceLocationContext(isAgentOpen);
  const ingredientCatalogQuery = usePreferenceIngredientsQuery('', {
    enabled: !preferencesQuery.isLoading,
    refetchInterval: (data) =>
      data?.ingredients.some(
        (ingredient) =>
          ingredient.imageStatus === 'pending' || ingredient.imageStatus === 'generating',
      )
        ? 5000
        : false,
  });
  const ingredientSuggestionsQuery = usePreferenceIngredientsQuery(specialtyDraft, {
    enabled: specialtyDraft.trim().length > 1,
  });

  const specialtyIngredients = useMemo(
    () =>
      sections
        .find((section) => section.heading === 'Specialty Ingredients')
        ?.lines.map(cleanPreferenceLine) ?? [],
    [sections],
  );

  const catalogItems = useMemo(() => {
    const items = new Map<string, SpecialtyIngredientCatalogItem>();
    (ingredientCatalogQuery.data?.ingredients ?? []).forEach((ingredient) => {
      items.set(ingredient._id, ingredient);
    });
    (ingredientSuggestionsQuery.data?.ingredients ?? []).forEach((ingredient) => {
      items.set(ingredient._id, ingredient);
    });
    return Array.from(items.values());
  }, [ingredientCatalogQuery.data?.ingredients, ingredientSuggestionsQuery.data?.ingredients]);

  const catalogNames = useMemo(
    () => new Set(catalogItems.flatMap(catalogLookupKeysForItem)),
    [catalogItems],
  );

  const sendToAgent = useCallback(
    (message: string) => {
      const clean = message.trim();
      setThread([...thread, { id: messageId(), role: 'user' as const, content: clean }]);
      setDraft('');

      chatMutation.mutate(
        {
          message: clean,
          history: thread.map(({ role, content }) => ({ role, content })),
          deviceContext: deviceLocationContext.context,
        },
        {
          onSuccess: (response) => {
            setThread((current) => [
              ...current,
              { id: messageId(), role: 'assistant', content: response.text },
            ]);
          },
          onError: () => {
            setThread((current) => [
              ...current,
              {
                id: messageId(),
                role: 'assistant',
                content: localize('com_preferences_agent_error'),
              },
            ]);
          },
        },
      );
    },
    [chatMutation, deviceLocationContext.context, localize, thread],
  );

  useEffect(() => {
    if (!isProfileEditing) {
      setProfileDrafts(profileDraftsFromSections(sections));
    }
  }, [isProfileEditing, sections]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread, chatMutation.isLoading]);

  useEffect(() => {
    const inferred = inferSpecialtyIngredientCategory(specialtyDraft);
    setSpecialtyDraftCategory(inferred);
  }, [specialtyDraft]);

  useEffect(() => {
    if (
      preferencesQuery.isLoading ||
      ingredientCatalogQuery.isLoading ||
      autoResolveIngredientMutation.isLoading
    ) {
      return;
    }

    const missing = specialtyIngredients.find((ingredient) => {
      const keys = catalogLookupKeysForName(ingredient);
      return (
        !keys.some((key) => catalogNames.has(key)) &&
        !keys.some((key) => autoResolvedIngredientsRef.current.has(key))
      );
    });
    if (!missing) {
      return;
    }

    catalogLookupKeysForName(missing).forEach((key) => autoResolvedIngredientsRef.current.add(key));
    autoResolveIngredientMutation.mutate(
      { name: missing, category: inferSpecialtyIngredientCategory(missing) },
      { onError: () => undefined },
    );
  }, [
    autoResolveIngredientMutation,
    catalogNames,
    ingredientCatalogQuery.isLoading,
    preferencesQuery.isLoading,
    specialtyIngredients,
  ]);

  const submit = () => {
    if (!draft.trim() || chatMutation.isLoading) {
      return;
    }
    sendToAgent(draft);
  };

  const startProfileEditing = () => {
    setProfileDrafts(profileDraftsFromSections(sections));
    setEditError('');
    setIsProfileEditing(true);
  };

  const cancelProfileEditing = () => {
    setProfileDrafts(profileDraftsFromSections(sections));
    setEditError('');
    setIsProfileEditing(false);
  };

  const setProfileLine = (heading: PreferenceHeading, index: number, value: string) => {
    setProfileDrafts((current) => {
      const next = new Map(current);
      const lines = [...(next.get(heading) ?? [''])];
      lines[index] = value;
      next.set(heading, lines);
      return next;
    });
  };

  const addProfileLine = (heading: PreferenceHeading) => {
    setProfileDrafts((current) => {
      const next = new Map(current);
      next.set(heading, [...(next.get(heading) ?? []), '']);
      return next;
    });
  };

  const removeProfileLine = (heading: PreferenceHeading, index: number) => {
    setProfileDrafts((current) => {
      const next = new Map(current);
      const lines = (next.get(heading) ?? []).filter((_, lineIndex) => lineIndex !== index);
      next.set(heading, lines.length > 0 ? lines : ['']);
      return next;
    });
  };

  const saveProfileEditing = () => {
    if (updatePreferencesMutation.isLoading) {
      return;
    }

    const nextMarkdown = atAGlanceHeadings.reduce(
      (current, { heading }) =>
        replacePreferenceSection(current, heading, profileDrafts.get(heading) ?? []),
      markdown,
    );

    setEditError('');
    updatePreferencesMutation.mutate(
      { markdown: nextMarkdown },
      {
        onSuccess: () => {
          setIsProfileEditing(false);
        },
        onError: () => {
          setEditError(localize('com_ui_error_updating_preferences'));
        },
      },
    );
  };

  const saveSpecialtyIngredients = (
    nextIngredients: string[],
    nextOverrides = categoryOverrides,
  ) => {
    const cleaned = Array.from(new Set(nextIngredients.map(cleanPreferenceLine).filter(Boolean)));

    updatePreferencesMutation.mutate(
      {
        markdown: replacePreferenceSection(markdown, 'Specialty Ingredients', cleaned),
      },
      {
        onSuccess: () => {
          setSpecialtyDraft('');
          setCategoryOverrides(nextOverrides);
          setEditingIngredient('');
          setEditingName('');
        },
        onError: () => {
          setEditError(localize('com_ui_error_updating_preferences'));
        },
      },
    );
  };

  const addCatalogIngredient = (ingredient: SpecialtyIngredientCatalogItem) => {
    if (updatePreferencesMutation.isLoading || resolveIngredientMutation.isLoading) {
      return;
    }
    const nextOverrides = new Map(categoryOverrides);
    nextOverrides.set(ingredient.displayName, ingredient.category);
    saveSpecialtyIngredients([...specialtyIngredients, ingredient.displayName], nextOverrides);
  };

  const addSpecialtyIngredient = (name = specialtyDraft) => {
    const ingredient = cleanPreferenceLine(name);
    if (!ingredient || updatePreferencesMutation.isLoading || resolveIngredientMutation.isLoading) {
      return;
    }
    resolveIngredientMutation.mutate(
      { name: ingredient, category: specialtyDraftCategory },
      {
        onSuccess: addCatalogIngredient,
        onError: () => {
          setEditError(localize('com_ui_error_updating_preferences'));
        },
      },
    );
  };

  const removeSpecialtyIngredient = (ingredient: string) => {
    if (updatePreferencesMutation.isLoading) {
      return;
    }
    const nextOverrides = new Map(categoryOverrides);
    nextOverrides.delete(ingredient);
    saveSpecialtyIngredients(
      specialtyIngredients.filter((item) => item !== ingredient),
      nextOverrides,
    );
  };

  const startEditingIngredient = (ingredient: string) => {
    setEditingIngredient(ingredient);
    setEditingName(ingredient);
    setEditingCategory(
      categoryOverrides.get(ingredient) ?? inferSpecialtyIngredientCategory(ingredient),
    );
  };

  const saveEditingIngredient = () => {
    const nextName = cleanPreferenceLine(editingName);
    if (!editingIngredient || !nextName || updatePreferencesMutation.isLoading) {
      return;
    }
    const nextOverrides = new Map(categoryOverrides);
    nextOverrides.delete(editingIngredient);
    nextOverrides.set(nextName, editingCategory);
    saveSpecialtyIngredients(
      specialtyIngredients.map((ingredient) =>
        ingredient === editingIngredient ? nextName : ingredient,
      ),
      nextOverrides,
    );
  };
  let profileActionIcon = <Plus className="icon-sm" aria-hidden="true" />;
  if (isProfileEditing) {
    profileActionIcon = <Save className="icon-sm" aria-hidden="true" />;
  }
  if (updatePreferencesMutation.isLoading) {
    profileActionIcon = <Spinner className="icon-sm" />;
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[#faf7f1] text-text-primary dark:bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full px-4 py-8 sm:px-8 lg:px-14">
          <section aria-label={localize('com_preferences_document')} className="min-w-0 space-y-6">
            <header className="pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <h1 className="font-serif text-6xl font-normal leading-none tracking-normal text-text-primary sm:text-7xl">
                  {localize('com_preferences_dashboard_title')}
                </h1>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-hover hover:text-text-primary"
                    onClick={() => setIsAgentOpen(true)}
                  >
                    <Eye className="icon-sm" aria-hidden="true" />
                    {localize('com_preferences_preview_profile')}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-surface-submit px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-surface-submit-hover disabled:opacity-50"
                    disabled={preferencesQuery.isLoading || updatePreferencesMutation.isLoading}
                    onClick={() =>
                      isProfileEditing ? saveProfileEditing() : startProfileEditing()
                    }
                  >
                    {profileActionIcon}
                    {isProfileEditing
                      ? localize('com_preferences_save_changes')
                      : localize('com_preferences_add_edit')}
                  </button>
                  {isProfileEditing && (
                    <button
                      type="button"
                      className="rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                      disabled={updatePreferencesMutation.isLoading}
                      onClick={cancelProfileEditing}
                    >
                      {localize('com_ui_cancel')}
                    </button>
                  )}
                </div>
              </div>
            </header>
            {editError && (
              <div className="rounded-lg border border-red-700/30 bg-red-700/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {editError}
              </div>
            )}
            {preferencesQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-border-light bg-surface-primary">
                <Spinner className="text-text-primary" />
              </div>
            ) : (
              <>
                <AtAGlanceGrid
                  sections={sections}
                  drafts={profileDrafts}
                  isEditing={isProfileEditing}
                  isSaving={updatePreferencesMutation.isLoading}
                  localize={localize}
                  onEdit={startProfileEditing}
                  onLineChange={setProfileLine}
                  onAddLine={addProfileLine}
                  onRemoveLine={removeProfileLine}
                />
                <SpecialtyIngredientsPanel
                  ingredients={specialtyIngredients}
                  catalogItems={catalogItems}
                  suggestions={ingredientSuggestionsQuery.data?.ingredients ?? []}
                  categoryOverrides={categoryOverrides}
                  draft={specialtyDraft}
                  draftCategory={specialtyDraftCategory}
                  editingIngredient={editingIngredient}
                  editingName={editingName}
                  editingCategory={editingCategory}
                  isSaving={updatePreferencesMutation.isLoading}
                  isResolving={resolveIngredientMutation.isLoading}
                  localize={localize}
                  onDraftChange={setSpecialtyDraft}
                  onDraftCategoryChange={setSpecialtyDraftCategory}
                  onAdd={addSpecialtyIngredient}
                  onAddCatalogItem={addCatalogIngredient}
                  onRemove={removeSpecialtyIngredient}
                  onEdit={startEditingIngredient}
                  onEditingNameChange={setEditingName}
                  onEditingCategoryChange={setEditingCategory}
                  onCancelEdit={() => setEditingIngredient('')}
                  onSaveEdit={saveEditingIngredient}
                />
              </>
            )}
          </section>
        </div>
      </div>

      <PreferencesAgentDialog
        open={isAgentOpen}
        thread={thread}
        draft={draft}
        isLoading={chatMutation.isLoading}
        localize={localize}
        endRef={endRef}
        onDraftChange={setDraft}
        onSubmit={submit}
        onClose={() => setIsAgentOpen(false)}
      />
    </main>
  );
}
