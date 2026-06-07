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
import {
  ALLERGEN_PRESETS,
  AUTOCOMPLETE_SUGGESTIONS,
  COOKING_LEVELS,
  DIET_PRESETS,
  KITCHEN_PRESETS,
} from './presets';

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

type KitchenPresetCategory = keyof typeof KITCHEN_PRESETS;

type KitchenPresetMatch = {
  category: KitchenPresetCategory;
  name: string;
};

type ProfileDrafts = Map<PreferenceHeading, string[]>;

const kitchenCategoryLabelKeys: Record<KitchenPresetCategory, TranslationKeys> = {
  appliances: 'com_preferences_kitchen_group_appliances',
  cooktops: 'com_preferences_kitchen_group_cooktops',
  tools: 'com_preferences_kitchen_group_tools',
};

const kitchenCategoryPlaceholderKeys: Record<KitchenPresetCategory, TranslationKeys> = {
  appliances: 'com_preferences_kitchen_custom_appliance_placeholder',
  cooktops: 'com_preferences_kitchen_custom_cooktop_placeholder',
  tools: 'com_preferences_kitchen_custom_tool_placeholder',
};

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

function normalizeKitchenItem(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^owner of\s+/i, '')
    .replace(/[’']/g, "'")
    .replace(/'s\b/gi, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

const kitchenPresetLookup = new Map<string, KitchenPresetMatch>();

(
  Object.entries(KITCHEN_PRESETS) as Array<
    [KitchenPresetCategory, ReadonlyArray<{ name: string; label: string }>]
  >
).forEach(([category, presets]) => {
  presets.forEach((preset) => {
    const match = { category, name: preset.name };
    kitchenPresetLookup.set(normalizeKitchenItem(preset.name), match);
    kitchenPresetLookup.set(normalizeKitchenItem(preset.label), match);
  });
});

function resolveKitchenPreset(value: string): KitchenPresetMatch | undefined {
  return kitchenPresetLookup.get(normalizeKitchenItem(value));
}

function splitKitchenItems(value: string): string[] {
  return value.replace(/\.$/, '').split(/,\s+/).map(sentenceCase).filter(Boolean);
}

function kitchenCategoryItems(line: string, singular: string, plural: string): string[] | null {
  if (new RegExp(`^${singular}:`, 'i').test(line)) {
    return [sentenceCase(line.replace(new RegExp(`^${singular}:\\s*`, 'i'), ''))].filter(Boolean);
  }
  if (new RegExp(`^${plural}:`, 'i').test(line)) {
    return splitKitchenItems(line.replace(new RegExp(`^${plural}:\\s*`, 'i'), ''));
  }
  return null;
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
    const appliances = kitchenCategoryItems(line, 'appliance', 'appliances');
    const cooktops = kitchenCategoryItems(line, 'cooktop', 'cooktops');
    const tools = kitchenCategoryItems(line, 'tool', 'tools');
    if (appliances) {
      groups.appliances.push(...appliances);
      return;
    }
    if (cooktops) {
      groups.cooking.push(...cooktops);
      return;
    }
    if (tools) {
      groups.tools.push(...tools);
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
    <div className="mt-2 space-y-2.5 sm:mt-3 sm:space-y-3">
      {groups.map((group) => {
        const remaining = visibleBudget - used;
        const visible = group.items.slice(0, Math.max(remaining, 0));
        used += visible.length;
        if (visible.length === 0) {
          return null;
        }

        const hiddenCount = group.items.length - visible.length;
        return (
          <div key={group.labelKey} className="grid gap-1 sm:block sm:pl-1">
            <h3 className="rekky-meta text-text-secondary sm:mb-1">{localize(group.labelKey)}</h3>
            <div className="sm:border-border-light/60 space-y-1 sm:border-l sm:pl-4">
              {visible.map((item) => (
                <p
                  key={`${group.labelKey}:${item}`}
                  className="text-[0.92rem] leading-5 text-text-secondary sm:text-sm"
                >
                  {item}
                </p>
              ))}
              {hiddenCount > 0 && (
                <p className="text-text-secondary/80 text-xs leading-4">
                  {localize('com_preferences_more_count').replace('{count}', String(hiddenCount))}
                </p>
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

function DietSafetyEditor({
  heading,
  lines,
  onChange,
}: {
  heading: 'Diet' | 'Safety';
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const isSafety = heading === 'Safety';
  const presets = isSafety ? ALLERGEN_PRESETS : DIET_PRESETS;

  const activeNames = useMemo(() => {
    const cleaned = lines.map(cleanPreferenceLine).map((l) => l.toLowerCase());
    return new Set<string>(
      presets
        .filter((p) => cleaned.some((c) => c.includes(p.name.toLowerCase())))
        .map((p) => p.name),
    );
  }, [lines, presets]);

  const customTags = useMemo(() => {
    const cleaned = lines.map(cleanPreferenceLine).filter(Boolean);
    return cleaned.filter((line) => {
      const lower = line.toLowerCase();
      return !presets.some((p) => lower.includes(p.name.toLowerCase()));
    });
  }, [lines, presets]);

  const [inputVal, setInputVal] = useState('');

  const togglePreset = (name: string) => {
    const nextActive = new Set(activeNames);
    if (nextActive.has(name)) {
      nextActive.delete(name);
    } else {
      nextActive.add(name);
    }

    const nextLines: string[] = [];
    presets.forEach((p) => {
      if (nextActive.has(p.name)) {
        nextLines.push(p.name);
      }
    });
    nextLines.push(...customTags);
    onChange(nextLines.length > 0 ? nextLines : ['']);
  };

  const addCustomTag = () => {
    const clean = inputVal.trim();
    if (!clean) {
      return;
    }
    if (lines.some((l) => cleanPreferenceLine(l).toLowerCase() === clean.toLowerCase())) {
      setInputVal('');
      return;
    }
    const nextLines = lines.map(cleanPreferenceLine).filter(Boolean);
    nextLines.push(clean);
    onChange(nextLines);
    setInputVal('');
  };

  const removeCustomTag = (tagToRemove: string) => {
    const nextLines = lines
      .map(cleanPreferenceLine)
      .filter((l) => l.toLowerCase() !== tagToRemove.toLowerCase());
    onChange(nextLines.length > 0 ? nextLines : ['']);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="rekky-meta mb-2 text-text-secondary">
          {localize(
            isSafety
              ? 'com_preferences_editor_select_allergies'
              : 'com_preferences_editor_select_diets',
          )}
        </h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = activeNames.has(p.name);
            const activeClass = isSafety
              ? 'border-red-500 bg-red-500/10 text-red-700 shadow-[0_0_8px_rgba(239,68,68,0.2)] dark:text-red-400'
              : 'border-green-500 bg-green-500/10 text-green-700 shadow-[0_0_8px_rgba(34,197,94,0.2)] dark:text-green-400';
            return (
              <button
                key={p.name}
                type="button"
                className={cn(
                  'min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition-colors duration-200 sm:min-h-0 sm:py-1.5',
                  active
                    ? activeClass
                    : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:text-text-primary',
                )}
                aria-pressed={active}
                onClick={() => togglePreset(p.name)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border-light pt-3">
        <h3 className="rekky-meta mb-2 text-text-secondary">
          {localize('com_preferences_editor_custom_restrictions')}
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {customTags.map((tag) => (
            <span
              key={tag}
              className="flex min-h-9 items-center gap-1 rounded-full border border-border-light bg-surface-secondary py-1 pl-3 pr-1 text-xs text-text-primary"
            >
              {tag}
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                aria-label={`${localize('com_ui_delete')} ${tag}`}
                onClick={() => removeCustomTag(tag)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={inputVal}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            placeholder={localize(
              isSafety
                ? 'com_preferences_editor_allergies_placeholder'
                : 'com_preferences_editor_diets_placeholder',
            )}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
              }
            }}
          />
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border-light bg-surface-primary px-3 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            onClick={addCustomTag}
          >
            {localize('com_preferences_editor_add')}
          </button>
        </div>
      </div>
    </div>
  );
}

function KitchenCheckboxEditor({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const [customItems, setCustomItems] = useState<Record<KitchenPresetCategory, string>>({
    appliances: '',
    cooktops: '',
    tools: '',
  });
  const [activeCategory, setActiveCategory] = useState<KitchenPresetCategory>('appliances');
  const { activeItems, customCategories, customLabels } = useMemo(() => {
    const items = new Set<string>();
    const categories = new Map<string, KitchenPresetCategory | 'unavailable'>();
    const labels = new Map<string, string>();
    lines.map(cleanPreferenceLine).forEach((line) => {
      const lower = line.toLowerCase();
      const categoryItems: Array<{
        category: KitchenPresetCategory;
        items: string[] | null;
      }> = [
        { category: 'appliances', items: kitchenCategoryItems(line, 'appliance', 'appliances') },
        { category: 'cooktops', items: kitchenCategoryItems(line, 'cooktop', 'cooktops') },
        { category: 'tools', items: kitchenCategoryItems(line, 'tool', 'tools') },
      ];
      const explicitCategory = categoryItems.find(({ items }) => items !== null);
      if (explicitCategory?.items) {
        explicitCategory.items.forEach((item) => {
          const preset = resolveKitchenPreset(item);
          const key = normalizeKitchenItem(preset?.name ?? item);
          items.add(key);
          if (!preset) {
            categories.set(key, explicitCategory.category);
            labels.set(key, sentenceCase(item));
          }
        });
      } else if (lower.startsWith('no ')) {
        const key = normalizeKitchenItem(line);
        items.add(key);
        categories.set(key, 'unavailable');
        labels.set(key, sentenceCase(line));
      } else {
        const item = line.replace(/^owner of\s+/i, '');
        const preset = resolveKitchenPreset(item);
        const key = normalizeKitchenItem(preset?.name ?? item);
        items.add(key);
        if (!preset) {
          categories.set(
            key,
            /\b(stove|cooktop|burner|oven|bbq|grill)\b/i.test(line) ? 'cooktops' : 'tools',
          );
          labels.set(key, sentenceCase(item));
        }
      }
    });
    return { activeItems: items, customCategories: categories, customLabels: labels };
  }, [lines]);

  const selectedKitchenLines = (
    selectedItems: Set<string>,
    categoryOverrides = new Map<string, KitchenPresetCategory>(),
    labelOverrides = new Map<string, string>(),
  ) => {
    const appliances: string[] = [];
    const cooktops: string[] = [];
    const tools: string[] = [];
    const unavailable: string[] = [];

    KITCHEN_PRESETS.appliances.forEach((p) => {
      if (selectedItems.has(normalizeKitchenItem(p.name))) {
        appliances.push(p.label);
      }
    });
    KITCHEN_PRESETS.cooktops.forEach((p) => {
      if (selectedItems.has(normalizeKitchenItem(p.name))) {
        cooktops.push(p.label);
      }
    });
    KITCHEN_PRESETS.tools.forEach((p) => {
      if (selectedItems.has(normalizeKitchenItem(p.name))) {
        tools.push(p.label);
      }
    });

    Array.from(selectedItems).forEach((item) => {
      if (resolveKitchenPreset(item)) {
        return;
      }

      const category = categoryOverrides.get(item) ?? customCategories.get(item) ?? 'tools';
      const label = labelOverrides.get(item) ?? customLabels.get(item) ?? sentenceCase(item);
      if (category === 'appliances') {
        appliances.push(label);
        return;
      }
      if (category === 'cooktops') {
        cooktops.push(label);
        return;
      }
      if (category === 'unavailable') {
        unavailable.push(label);
        return;
      }
      tools.push(label);
    });

    const nextLines: string[] = [];
    appliances.forEach((item) => nextLines.push(`Appliance: ${item}`));
    cooktops.forEach((item) => nextLines.push(`Cooktop: ${item}`));
    tools.forEach((item) => nextLines.push(`Tool: ${item}`));
    unavailable.forEach((line) => nextLines.push(line));

    return nextLines.length > 0 ? nextLines : [''];
  };

  const updateSelectedKitchenItems = (nextActive: Set<string>) => {
    onChange(selectedKitchenLines(nextActive));
  };

  const toggleItem = (name: string) => {
    const key = normalizeKitchenItem(resolveKitchenPreset(name)?.name ?? name);
    const nextActive = new Set(activeItems);
    if (nextActive.has(key)) {
      nextActive.delete(key);
    } else {
      nextActive.add(key);
    }

    updateSelectedKitchenItems(nextActive);
  };

  const addCustomItem = (category: KitchenPresetCategory) => {
    const clean = customItems[category].trim();
    if (!clean) {
      return;
    }

    const preset = resolveKitchenPreset(clean);
    const key = normalizeKitchenItem(preset?.name ?? clean);
    const nextActive = new Set(activeItems);
    nextActive.add(key);
    const categoryOverrides = new Map<string, KitchenPresetCategory>();
    if (!preset) {
      categoryOverrides.set(key, category);
    }
    const labelOverrides = new Map<string, string>();
    if (!preset) {
      labelOverrides.set(key, sentenceCase(clean));
    }
    onChange(selectedKitchenLines(nextActive, categoryOverrides, labelOverrides));
    setCustomItems((current) => ({ ...current, [category]: '' }));
  };

  const customItemsByCategory = useMemo(() => {
    const categories: Record<KitchenPresetCategory, string[]> = {
      appliances: [],
      cooktops: [],
      tools: [],
    };
    activeItems.forEach((item) => {
      if (resolveKitchenPreset(item)) {
        return;
      }
      const category = customCategories.get(item);
      if (category && category !== 'unavailable') {
        categories[category].push(customLabels.get(item) ?? sentenceCase(item));
      }
    });
    return categories;
  }, [activeItems, customCategories, customLabels]);

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-3 rounded-lg bg-surface-secondary p-1 sm:hidden"
        role="tablist"
        aria-label={localize('com_preferences_editor_edit_section').replace('{heading}', 'Kitchen')}
      >
        {(Object.keys(KITCHEN_PRESETS) as KitchenPresetCategory[]).map((category) => {
          const selected = activeCategory === category;
          const count =
            KITCHEN_PRESETS[category].filter((item) =>
              activeItems.has(normalizeKitchenItem(item.name)),
            ).length + customItemsByCategory[category].length;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                'min-h-10 rounded-md px-2 text-xs font-medium transition-colors',
                selected ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary',
              )}
              onClick={() => setActiveCategory(category)}
            >
              {localize(kitchenCategoryLabelKeys[category])}
              {count > 0 && <span className="ml-1 text-[0.65rem] opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>
      {(
        Object.entries(KITCHEN_PRESETS) as Array<
          [KitchenPresetCategory, ReadonlyArray<{ name: string; label: string }>]
        >
      ).map(([category, items]) => {
        const label = localize(kitchenCategoryLabelKeys[category]);
        const customValue = customItems[category].trim();
        return (
          <div
            key={category}
            className={cn(
              'border-b border-border-light pb-4 last:border-b-0 last:pb-0',
              category !== activeCategory && 'max-sm:hidden',
            )}
          >
            <h3 className="rekky-meta mb-2 hidden text-text-secondary sm:block">{label}</h3>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4">
              {[
                ...items,
                ...customItemsByCategory[category].map((name) => ({ name, label: name })),
              ].map((item) => {
                const active = activeItems.has(normalizeKitchenItem(item.name));
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={cn(
                      'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[0.8rem] font-medium leading-4 transition-colors sm:px-3 sm:text-sm',
                      active
                        ? 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                        : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:text-text-primary',
                    )}
                    aria-pressed={active}
                    onClick={() => toggleItem(item.name)}
                  >
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded border',
                        active
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-border-medium',
                      )}
                    >
                      {active && <CheckCircle2 className="size-3" />}
                    </span>
                    <span className="min-w-0 break-words">{item.label}</span>
                  </button>
                );
              })}
              <div className="bg-surface-primary/40 group col-span-2 flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 transition-colors focus-within:border-border-medium focus-within:bg-surface-primary hover:border-border-medium hover:bg-surface-primary sm:col-span-1">
                <label className="sr-only" htmlFor={`custom-kitchen-${category}`}>
                  {localize('com_preferences_kitchen_custom_category_label').replace(
                    '{category}',
                    label.toLowerCase(),
                  )}
                </label>
                <Plus className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
                <input
                  id={`custom-kitchen-${category}`}
                  className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-medium text-text-primary outline-none ring-0 placeholder:text-text-secondary focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
                  value={customItems[category]}
                  placeholder={localize(kitchenCategoryPlaceholderKeys[category])}
                  onChange={(event) =>
                    setCustomItems((current) => ({ ...current, [category]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCustomItem(category);
                    }
                  }}
                />
                <button
                  type="button"
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition-colors',
                    customValue
                      ? 'text-text-secondary hover:text-text-primary'
                      : 'pointer-events-none opacity-0',
                  )}
                  aria-hidden={!customValue}
                  tabIndex={customValue ? 0 : -1}
                  onClick={() => addCustomItem(category)}
                >
                  {localize('com_preferences_editor_add')}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CookingLevelSlider({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const currentLevel = useMemo(() => {
    const raw = lines[0]?.toLowerCase() ?? '';
    const found = COOKING_LEVELS.find((cl) => raw.includes(cl.level.toLowerCase()));
    return found?.level ?? 'Home Cook';
  }, [lines]);

  const selectLevel = (level: string) => {
    onChange([level]);
  };

  return (
    <div className="space-y-4">
      <h3 className="rekky-meta text-text-secondary">
        {localize('com_preferences_editor_select_level')}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {COOKING_LEVELS.map((cl) => {
          const active = currentLevel === cl.level;
          return (
            <button
              key={cl.level}
              type="button"
              className={cn(
                'flex min-h-16 flex-col items-start rounded-lg border p-3 text-left transition-colors duration-200',
                active
                  ? 'border-amber-500 bg-amber-500/10 text-text-primary'
                  : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium hover:text-text-primary',
              )}
              onClick={() => selectLevel(cl.level)}
            >
              <div className="flex items-center gap-2 text-base font-medium">
                <span>{cl.label}</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">{cl.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HouseholdCounterEditor({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const counts = useMemo(() => {
    let adults = 1;
    let kids = 0;
    let teens = 0;

    lines.map(cleanPreferenceLine).forEach((line) => {
      const lower = line.toLowerCase();
      const match = lower.match(/(\d+)\s*(adult|child|kid|teen)/);
      if (match) {
        const count = parseInt(match[1], 10);
        const type = match[2];
        if (type.startsWith('adult')) {
          adults = count;
        } else if (type.startsWith('child') || type.startsWith('kid')) {
          kids = count;
        } else if (type.startsWith('teen')) {
          teens = count;
        }
      }
    });

    return { adults, kids, teens };
  }, [lines]);

  const updateCount = (type: 'adults' | 'kids' | 'teens', delta: number) => {
    const nextCounts = { ...counts };
    nextCounts[type] = Math.max(0, nextCounts[type] + delta);

    if (
      type === 'adults' &&
      nextCounts.adults === 0 &&
      nextCounts.kids === 0 &&
      nextCounts.teens === 0
    ) {
      nextCounts.adults = 1;
    }

    const nextLines: string[] = [];
    if (nextCounts.adults > 0) {
      nextLines.push(`${nextCounts.adults} adult${nextCounts.adults > 1 ? 's' : ''}`);
    }
    if (nextCounts.kids > 0) {
      nextLines.push(`${nextCounts.kids} child${nextCounts.kids > 1 ? 'ren' : ''}`);
    }
    if (nextCounts.teens > 0) {
      nextLines.push(`${nextCounts.teens} teenager${nextCounts.teens > 1 ? 's' : ''}`);
    }
    onChange(nextLines.length > 0 ? nextLines : ['1 adult']);
  };

  return (
    <div className="space-y-4">
      <h3 className="rekky-meta text-text-secondary">
        {localize('com_preferences_editor_household_size')}
      </h3>
      <div className="divide-y divide-border-light rounded-lg border border-border-light bg-surface-primary">
        {[
          { key: 'adults', label: localize('com_preferences_editor_adults'), count: counts.adults },
          { key: 'kids', label: localize('com_preferences_editor_children'), count: counts.kids },
          {
            key: 'teens',
            label: localize('com_preferences_editor_teenagers'),
            count: counts.teens,
          },
        ].map((item) => (
          <div key={item.key} className="flex min-h-16 items-center justify-between p-3">
            <span className="text-sm font-medium text-text-primary">{item.label}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-lg border border-border-light bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30 sm:size-9"
                disabled={item.count === 0}
                onClick={() => updateCount(item.key as 'adults' | 'kids' | 'teens', -1)}
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-semibold">{item.count}</span>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-lg border border-border-light bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary sm:size-9"
                onClick={() => updateCount(item.key as 'adults' | 'kids' | 'teens', 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationEditor({
  lines,
  onChange,
}: {
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const [isDetecting, setIsDetecting] = useState(false);
  const [success, setSuccess] = useState(false);

  const data = useMemo<{
    location: string;
    timezone: string;
    system: 'metric' | 'imperial';
  }>(() => {
    let location = '';
    let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let system: 'metric' | 'imperial' = 'metric';

    lines.map(cleanPreferenceLine).forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.startsWith('location:')) {
        location = line.replace(/^location:\s*/i, '');
      } else if (lower.startsWith('timezone:')) {
        timezone = line.replace(/^timezone:\s*/i, '');
      } else if (lower.includes('system: imperial') || lower.includes('measurement: imperial')) {
        system = 'imperial';
      } else if (lower.includes('system: metric') || lower.includes('measurement: metric')) {
        system = 'metric';
      } else if (!lower.includes(':') && line) {
        location = line;
      }
    });

    return { location, timezone, system };
  }, [lines]);

  const updateField = (key: 'location' | 'timezone' | 'system', value: string) => {
    const nextData = { ...data };
    if (key === 'system') {
      nextData.system = value as 'metric' | 'imperial';
    } else {
      nextData[key] = value;
    }

    const nextLines: string[] = [];
    if (nextData.location) {
      nextLines.push(`Location: ${nextData.location}`);
    }
    if (nextData.timezone) {
      nextLines.push(`Timezone: ${nextData.timezone}`);
    }
    nextLines.push(`System: ${nextData.system}`);
    onChange(nextLines);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      return;
    }
    setIsDetecting(true);
    setSuccess(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsDetecting(false);
        setSuccess(true);
        const coords = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
        updateField('location', coords);
        setTimeout(() => setSuccess(false), 3000);
      },
      () => {
        setIsDetecting(false);
      },
      { timeout: 5000 },
    );
  };

  const detectButtonLabel = isDetecting
    ? localize('com_preferences_editor_location_detecting')
    : localize(
        success
          ? 'com_preferences_editor_location_detected'
          : 'com_preferences_editor_location_detect',
      );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={isDetecting}
          className={cn(
            'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors duration-200',
            success
              ? 'border-green-500 bg-green-500/10 text-green-700'
              : 'border-border-light bg-surface-primary text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          )}
          onClick={detectLocation}
        >
          {isDetecting ? (
            <Spinner className="size-4 animate-spin" />
          ) : (
            <MapPin className="size-4" />
          )}
          {detectButtonLabel}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="rekky-meta mb-1 block text-text-secondary">
            {localize('com_preferences_editor_measurement_system')}
          </label>
          <div className="flex rounded-lg border border-border-light bg-surface-primary p-0.5">
            {['metric', 'imperial'].map((sys) => {
              const active = data.system === sys;
              return (
                <button
                  key={sys}
                  type="button"
                  className={cn(
                    'min-h-10 flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition-colors',
                    active
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                  onClick={() => updateField('system', sys)}
                >
                  {sys}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="location-timezone-select"
            className="rekky-meta mb-1 block text-text-secondary"
          >
            {localize('com_preferences_editor_timezone')}
          </label>
          <input
            id="location-timezone-select"
            value={data.timezone}
            className="min-h-11 w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            onChange={(e) => updateField('timezone', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="location-city-input" className="rekky-meta mb-1 block text-text-secondary">
          {localize('com_preferences_editor_location_label')}
        </label>
        <input
          id="location-city-input"
          value={data.location}
          className="min-h-11 w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          placeholder={localize('com_preferences_editor_location_placeholder')}
          onChange={(e) => updateField('location', e.target.value)}
        />
      </div>
    </div>
  );
}

function AutocompleteTagEditor({
  heading,
  lines,
  onChange,
}: {
  heading: PreferenceHeading;
  lines: string[];
  onChange: (nextLines: string[]) => void;
}) {
  const localize = useLocalize();
  const [inputVal, setInputVal] = useState('');

  const tags = useMemo(() => {
    return lines.map(cleanPreferenceLine).filter(Boolean);
  }, [lines]);

  const suggestions = useMemo(() => {
    const list = AUTOCOMPLETE_SUGGESTIONS[heading] ?? [];
    if (!inputVal.trim()) {
      return list.filter((item) => !tags.includes(item));
    }
    const filterLower = inputVal.toLowerCase();
    return list.filter((item) => item.toLowerCase().includes(filterLower) && !tags.includes(item));
  }, [heading, inputVal, tags]);

  const addTag = (text: string) => {
    const clean = text.trim();
    if (!clean) {
      return;
    }
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setInputVal('');
      return;
    }
    const nextLines = [...tags, clean];
    onChange(nextLines);
    setInputVal('');
  };

  const removeTag = (tagToRemove: string) => {
    const nextLines = tags.filter((t) => t !== tagToRemove);
    onChange(nextLines.length > 0 ? nextLines : ['']);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="rekky-meta mb-2 text-text-secondary">
          {localize('com_preferences_editor_active_toggles')}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex min-h-9 items-center gap-1 rounded-full border border-border-light bg-surface-secondary py-1 pl-3 pr-1 text-xs text-text-primary"
            >
              {tag}
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                aria-label={`${localize('com_ui_delete')} ${tag}`}
                onClick={() => removeTag(tag)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <p className="text-xs italic text-text-secondary">
              {localize('com_preferences_editor_no_tags')}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={inputVal}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          placeholder={localize('com_preferences_editor_tag_placeholder').replace(
            '{heading}',
            heading.toLowerCase(),
          )}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(inputVal);
            }
          }}
        />
        <button
          type="button"
          className="min-h-11 rounded-lg border border-border-light bg-surface-primary px-3 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          onClick={() => addTag(inputVal)}
        >
          {localize('com_preferences_editor_add')}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div>
          <h4 className="rekky-meta mb-1.5 text-text-secondary">
            {localize('com_preferences_editor_suggestions')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                className="min-h-9 rounded-full border border-border-light bg-surface-primary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-medium hover:text-text-primary"
                onClick={() => addTag(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PreferenceCard({
  config,
  sections,
  localize,
  onEdit,
}: {
  config: HeadingConfig;
  sections: PreferenceSection[];
  localize: Localize;
  onEdit: (heading: PreferenceHeading) => void;
}) {
  const Icon = config.icon;
  const section = sectionByHeading(sections, config.heading);
  const isComplete = section.lines.length > 0;

  let content: ReactNode;
  if (isComplete && config.heading === 'Kitchen') {
    content = <KitchenPreferenceSummary lines={section.lines} localize={localize} />;
  } else if (isComplete) {
    content = (
      <ul className="mt-2 space-y-1 text-[0.94rem] leading-5 text-text-secondary sm:text-sm">
        {section.lines.map((line) => (
          <li key={`${config.heading}:${line}`} className="break-words">
            {cleanPreferenceLine(line)}
          </li>
        ))}
      </ul>
    );
  } else {
    content = (
      <p className="mt-2 text-[0.94rem] italic leading-5 text-text-secondary sm:text-sm">
        {localize('com_preferences_not_set')}
      </p>
    );
  }

  return (
    <article className="hover:bg-surface-primary/20 group relative w-full min-w-0 rounded-md py-1 transition-colors sm:py-1.5">
      <button
        type="button"
        className="absolute inset-0 z-10 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
        aria-label={`${localize('com_ui_edit')} ${config.heading}`}
        onClick={() => onEdit(config.heading)}
      >
        <span className="sr-only">{localize('com_ui_edit')}</span>
      </button>
      <div className="flex items-start gap-2.5 sm:gap-2.5">
        <Icon
          className="text-text-secondary/70 mt-0.5 size-3.5 flex-shrink-0 sm:mt-1"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h2 className="text-[1rem] font-medium uppercase leading-none tracking-[0.12em] text-text-primary transition-colors group-hover:text-surface-submit sm:text-lg sm:tracking-[0.08em]">
              {config.heading}
            </h2>
          </div>
          {content}
        </div>
      </div>
    </article>
  );
}

function PreferenceCardModal({
  heading,
  draftLines,
  isSaving,
  localize,
  onDraftsChange,
  onSaveCard,
  onCancelCard,
}: {
  heading: PreferenceHeading;
  draftLines: string[];
  isSaving: boolean;
  localize: Localize;
  onDraftsChange: (heading: PreferenceHeading, nextLines: string[]) => void;
  onSaveCard: (heading: PreferenceHeading) => void;
  onCancelCard: () => void;
}) {
  const config = atAGlanceHeadings.find((h) => h.heading === heading);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancelCard);
  cancelRef.current = onCancelCard;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelRef.current();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  if (!config) {
    return null;
  }
  const Icon = config.icon;
  const titleId = `preference-editor-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  let content: ReactNode;
  if (heading === 'Diet' || heading === 'Safety') {
    content = (
      <DietSafetyEditor
        heading={heading}
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  } else if (heading === 'Kitchen') {
    content = (
      <KitchenCheckboxEditor
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  } else if (heading === 'Cooking Level') {
    content = (
      <CookingLevelSlider
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  } else if (heading === 'Household') {
    content = (
      <HouseholdCounterEditor
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  } else if (heading === 'Location') {
    content = (
      <LocationEditor
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  } else {
    content = (
      <AutocompleteTagEditor
        heading={heading}
        lines={draftLines}
        onChange={(nextLines) => onDraftsChange(heading, nextLines)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-0 backdrop-blur-md sm:z-[100] sm:items-center sm:px-4 sm:py-6"
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          window.matchMedia('(min-width: 640px)').matches
        ) {
          onCancelCard();
        }
      }}
    >
      <motion.div
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.3 }}
        className={cn(
          'flex h-[100dvh] w-full flex-col overflow-hidden bg-surface-primary shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl sm:border sm:border-border-light',
          heading === 'Kitchen' ? 'max-w-5xl' : 'max-w-2xl',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border-light pl-14 pr-14 sm:min-h-0 sm:px-6 sm:py-4">
          <Icon
            className="hidden size-5 flex-shrink-0 text-text-secondary sm:block"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-text-primary sm:text-lg">
              {localize('com_preferences_editor_edit_section').replace('{heading}', heading)}
            </h2>
            <p className="mt-0.5 hidden text-xs text-text-secondary sm:block">
              {localize('com_preferences_editor_hint')}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {content}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-border-light bg-surface-primary px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:justify-end sm:gap-3 sm:px-6 sm:pb-4 sm:pt-4">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-lg border border-border-light bg-surface-primary px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary sm:flex-none"
            onClick={onCancelCard}
          >
            {localize('com_ui_cancel')}
          </button>
          <button
            type="button"
            className="flex min-h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-surface-submit px-4 text-sm font-medium text-white shadow-sm hover:bg-surface-submit-hover disabled:opacity-50 sm:flex-none"
            disabled={isSaving}
            onClick={() => onSaveCard(heading)}
          >
            {isSaving ? <Spinner className="size-4" /> : <CheckCircle2 className="size-4" />}
            {localize('com_preferences_save_changes')}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

function AtAGlanceGrid({
  sections,
  drafts,
  activeEditingCard,
  isSaving,
  localize,
  onEdit,
  onDraftsChange,
  onSaveCard,
  onCancelCard,
}: {
  sections: PreferenceSection[];
  drafts: ProfileDrafts;
  activeEditingCard: PreferenceHeading | null;
  isSaving: boolean;
  localize: Localize;
  onEdit: (heading: PreferenceHeading) => void;
  onDraftsChange: (heading: PreferenceHeading, nextLines: string[]) => void;
  onSaveCard: (heading: PreferenceHeading) => void;
  onCancelCard: () => void;
}) {
  return (
    <section>
      <div className="columns-1 gap-x-12 [column-fill:balance] md:columns-2 xl:columns-3 2xl:columns-4">
        {atAGlanceHeadings.map((config) => (
          <div key={config.heading} className="mb-7 break-inside-avoid sm:mb-10">
            <PreferenceCard
              config={config}
              sections={sections}
              localize={localize}
              onEdit={onEdit}
            />
          </div>
        ))}
      </div>

      <AnimatePresence>
        {activeEditingCard && (
          <PreferenceCardModal
            heading={activeEditingCard}
            draftLines={drafts.get(activeEditingCard) ?? ['']}
            isSaving={isSaving}
            localize={localize}
            onDraftsChange={onDraftsChange}
            onSaveCard={onSaveCard}
            onCancelCard={onCancelCard}
          />
        )}
      </AnimatePresence>
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
    <div className="bg-surface-primary/45 relative aspect-[5/3] overflow-hidden rounded-md dark:bg-white/5">
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
        <div className="text-text-secondary/75 flex size-full flex-col items-center justify-center gap-2">
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
    <section className="pt-2">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-medium uppercase leading-none tracking-[0.08em] text-text-primary">
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
            className="border-border-light/70 placeholder:text-text-secondary/70 w-full min-w-0 rounded-md border bg-surface-primary py-2 pl-10 pr-10 text-sm text-text-primary shadow-none [color-scheme:light] focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:bg-white/5 dark:[color-scheme:dark]"
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
                <div className="rekky-meta border-b border-border-light px-3 py-2 text-text-secondary">
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
                className="min-w-40 rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-5">
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
                className="group relative min-w-0"
              >
                <span className="absolute right-2 top-2 z-10 flex size-4 items-center justify-center rounded-full bg-black/35 text-white opacity-70 backdrop-blur">
                  <CheckCircle2 className="icon-xs" aria-hidden="true" />
                </span>
                <IngredientThumb ingredient={catalogItem} fallbackName={ingredient} />
                <div className="pt-2">
                  <button
                    type="button"
                    className="block w-full truncate text-left text-sm font-medium leading-tight text-text-primary"
                    onClick={() => onEdit(ingredient)}
                  >
                    {ingredient}
                  </button>
                  <p className="rekky-meta mt-1 truncate text-text-secondary">
                    {localize(categoryLabels[category])}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={localize('com_preferences_specialty_remove')}
                  className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur hover:bg-black/55 focus-visible:opacity-100 group-hover:opacity-100"
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
              className="min-w-0 rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              aria-label={localize('com_preferences_specialty_edit_label')}
              onChange={(event) => onEditingNameChange(event.target.value)}
            />
            <select
              value={editingCategory}
              className="rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
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
  suggestions,
  complete,
  onDraftChange,
  onSubmit,
  onSendSuggestion,
  onClose,
}: {
  open: boolean;
  thread: ThreadMessage[];
  draft: string;
  isLoading: boolean;
  localize: Localize;
  endRef: RefObject<HTMLDivElement>;
  suggestions: Array<{ text: string; display: string }>;
  complete: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onSendSuggestion: (value: string) => void;
  onClose: () => void;
}) {
  const showCompletedState = complete;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 py-0 backdrop-blur-md sm:items-center sm:px-3 sm:py-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-agent-title"
        className="border-border-light/10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-surface-primary shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6">
          <div>
            <h2
              id="preferences-agent-title"
              className="flex items-center gap-2 text-base font-semibold text-text-primary"
            >
              {showCompletedState && (
                <CheckCircle2 className="size-5 flex-shrink-0 text-green-500" aria-hidden="true" />
              )}
              {showCompletedState
                ? localize('com_preferences_profile_refined_title')
                : localize('com_preferences_review_action')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {showCompletedState
                ? localize('com_preferences_profile_refined_hint')
                : localize('com_preferences_agent_hint')}
            </p>
            {!showCompletedState && (
              <p className="text-text-secondary/70 mt-1 text-xs">
                {localize('com_preferences_device_location_hint')}
              </p>
            )}
          </div>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_close')}
            onClick={onClose}
          >
            <X className="icon-sm" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          <div className="flex flex-col gap-4">
            {thread.map((message) =>
              message.content ? (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'ml-auto bg-surface-active-alt text-text-primary'
                      : 'bg-surface-secondary/45 mr-auto text-text-primary',
                  )}
                >
                  {message.content}
                </div>
              ) : null,
            )}
            {isLoading && (
              <div className="bg-surface-secondary/45 mr-auto flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-text-secondary">
                <Spinner className="icon-sm" />
                {localize('com_preferences_agent_thinking')}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {suggestions.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 bg-surface-primary px-6 py-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                className="bg-surface-secondary/50 rounded-full border-0 px-3.5 py-1.5 text-xs text-text-secondary shadow-none transition-all duration-150 hover:bg-surface-hover hover:text-text-primary"
                onClick={() => onSendSuggestion(suggestion.text)}
              >
                {suggestion.display}
              </button>
            ))}
          </div>
        )}

        <div className="bg-surface-primary px-6 pb-6 pt-3">
          <div className="bg-surface-secondary/60 focus-within:bg-surface-secondary/80 flex items-center gap-2 rounded-xl border-0 p-1.5 transition-all duration-150">
            <label htmlFor="preferences-agent-message" className="sr-only">
              {localize('com_preferences_message_label')}
            </label>
            <textarea
              id="preferences-agent-message"
              value={draft}
              rows={1}
              className="max-h-24 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              placeholder={
                showCompletedState
                  ? localize('com_preferences_profile_refined_placeholder')
                  : localize('com_preferences_message_placeholder')
              }
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
              className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-submit text-white transition-colors hover:bg-surface-submit-hover disabled:opacity-50"
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
  const isProfileComplete = useMemo(() => {
    const required = [
      'Safety',
      'Diet',
      'Religious & Cultural Rules',
      'Cooking Level',
      'Household',
      'Kitchen',
      'Goals',
      'Location',
    ];
    return required.every((heading) => {
      const sec = sections.find((s) => s.heading === heading);
      return sec && sec.lines.length > 0;
    });
  }, [sections]);
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; display: string }>>([]);
  const [complete, setComplete] = useState(false);
  const [activeEditingCard, setActiveEditingCard] = useState<PreferenceHeading | null>(null);
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
      if (clean) {
        setThread((current) => [
          ...current,
          { id: messageId(), role: 'user' as const, content: clean },
        ]);
      }
      setDraft('');

      chatMutation.mutate(
        {
          message: clean,
          history: thread
            .filter(({ content }) => content.trim())
            .map(({ role, content }) => ({ role, content })),
          deviceContext: deviceLocationContext.context,
        },
        {
          onSuccess: (response) => {
            setThread((current) => [
              ...current,
              { id: messageId(), role: 'assistant', content: response.text },
            ]);
            setSuggestions(response.suggestions ?? []);
            setComplete(response.complete ?? false);
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

  const isProfileEditing = activeEditingCard !== null;

  useEffect(() => {
    if (!isProfileEditing) {
      setProfileDrafts(profileDraftsFromSections(sections));
    }
  }, [isProfileEditing, sections]);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [thread, chatMutation.isLoading]);

  useEffect(() => {
    if (isAgentOpen && thread.length === 0 && !chatMutation.isLoading) {
      sendToAgent('');
    }
  }, [isAgentOpen, thread.length, chatMutation.isLoading, sendToAgent]);

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

  const startProfileEditing = (heading?: PreferenceHeading) => {
    setProfileDrafts(profileDraftsFromSections(sections));
    setEditError('');
    setActiveEditingCard(heading ?? 'Diet');
  };

  const cancelProfileEditing = () => {
    setProfileDrafts(profileDraftsFromSections(sections));
    setEditError('');
    setActiveEditingCard(null);
  };

  const handleDraftsChange = (heading: PreferenceHeading, nextLines: string[]) => {
    setProfileDrafts((current) => {
      const next = new Map(current);
      next.set(heading, nextLines);
      return next;
    });
  };

  const saveProfileEditing = (heading = activeEditingCard) => {
    if (!heading || updatePreferencesMutation.isLoading) {
      return;
    }

    const nextMarkdown = replacePreferenceSection(
      markdown,
      heading,
      profileDrafts.get(heading) ?? [],
    );

    setEditError('');
    updatePreferencesMutation.mutate(
      { markdown: nextMarkdown },
      {
        onSuccess: () => {
          setActiveEditingCard(null);
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

  return (
    <main className="rekky-ui rekky-preferences-surface flex h-full min-h-0 flex-col bg-[#f7f1e8] text-text-primary dark:bg-[#141014]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full px-5 py-8 sm:px-8 lg:px-16">
          <section
            aria-label={localize('com_preferences_document')}
            className="min-w-0 space-y-8 sm:space-y-12"
          >
            <header>
              <div className="flex flex-col gap-4 pt-1 lg:flex-row lg:items-start lg:justify-between lg:pt-0">
                <h1 className="max-w-[18rem] text-[2.55rem] font-medium leading-[0.92] tracking-[-0.035em] text-text-primary sm:max-w-4xl sm:text-6xl sm:tracking-[-0.01em]">
                  {localize('com_preferences_dashboard_title')}
                </h1>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    className="border-border-light/60 bg-surface-primary/35 sm:bg-surface-primary/65 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium text-text-secondary shadow-none transition-colors hover:bg-surface-hover hover:text-text-primary sm:mt-1 sm:rounded-md sm:border-0"
                    onClick={() => setIsAgentOpen(true)}
                  >
                    <Eye className="icon-sm" aria-hidden="true" />
                    {localize('com_preferences_preview_profile')}
                  </button>
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
                  activeEditingCard={activeEditingCard}
                  isSaving={updatePreferencesMutation.isLoading}
                  localize={localize}
                  onEdit={startProfileEditing}
                  onDraftsChange={handleDraftsChange}
                  onSaveCard={saveProfileEditing}
                  onCancelCard={cancelProfileEditing}
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
        suggestions={suggestions}
        complete={isProfileComplete || complete}
        onDraftChange={setDraft}
        onSubmit={submit}
        onSendSuggestion={sendToAgent}
        onClose={() => setIsAgentOpen(false)}
      />
    </main>
  );
}
