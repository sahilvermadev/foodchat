/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import PreferencesWorkspace from './Workspace';

const mockUpdateMutate = jest.fn();
const mockChatMutate = jest.fn();
const mockResolveMutate = jest.fn();

let mockMarkdown = '';
let mockIngredientCatalog: Array<Record<string, string | string[]>> = [];
let mockIngredientSuggestions: Array<Record<string, string | string[]>> = [];

jest.mock('@librechat/client', () => ({
  Spinner: ({ className }: { className?: string }) => (
    <span data-testid="spinner" className={className} />
  ),
  useMediaQuery: jest.fn().mockReturnValue(false),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const labels: Record<string, string> = {
      com_preferences_add_detail: 'Add detail',
      com_preferences_add_edit: 'Add / Edit',
      com_preferences_dashboard_title: 'Your cooking profile',
      com_preferences_detail_label: '{section} detail {number}',
      com_preferences_detail_placeholder: 'Add a detail',
      com_preferences_edit: 'Edit preferences',
      com_preferences_preview_profile: 'Ask Mise to refine',
      com_preferences_section_complete: 'Complete',
      com_preferences_section_missing: 'Add more',
      com_preferences_kitchen_group_appliances: 'Appliances',
      com_preferences_kitchen_group_cooking: 'Cooking setup',
      com_preferences_kitchen_group_tools: 'Tools',
      com_preferences_kitchen_group_unavailable: 'Unavailable',
      com_preferences_more_count: '+{count} more',
      com_preferences_review_action: 'Ask Mise to improve this profile',
      com_preferences_remove_detail: 'Remove detail',
      com_preferences_save_changes: 'Save changes',
      com_preferences_specialty_add_label: 'Add',
      com_preferences_specialty_remove: 'Remove specialty ingredient',
      com_preferences_specialty_category_label: 'Specialty ingredient category',
      com_preferences_specialty_create: 'Create "{name}"',
      com_preferences_specialty_clear: 'Clear ingredient',
      com_preferences_specialty_search_placeholder: 'Add an ingredient',
      com_preferences_specialty_short_placeholder: 'What do you have?',
      com_preferences_specialty_suggestions_label: 'Ingredient suggestions',
      com_preferences_specialty_title: 'Specialty Ingredients',
      com_ui_cancel: 'Cancel',
      com_ui_edit: 'Edit',
      com_ui_save: 'Save',
    };
    return labels[key] ?? key;
  },
}));

jest.mock('~/data-provider', () => ({
  usePreferencesQuery: () => ({ data: { markdown: mockMarkdown }, isLoading: false }),
  usePreferenceIngredientsQuery: (query?: string) => ({
    data: { ingredients: query ? mockIngredientSuggestions : mockIngredientCatalog },
    isLoading: false,
  }),
  useUpdatePreferencesMutation: () => ({
    isLoading: false,
    mutate: mockUpdateMutate,
  }),
  useResolvePreferenceIngredientMutation: () => ({
    isLoading: false,
    mutate: mockResolveMutate,
  }),
  usePreferencesChatMutation: () => ({
    isLoading: false,
    mutate: mockChatMutate,
  }),
}));

describe('PreferencesWorkspace', () => {
  beforeEach(() => {
    mockMarkdown = [
      '## Safety',
      '- No peanuts',
      '',
      '## Kitchen',
      '- Appliances: Siemens oven, electric grill, portable blender',
      '- Owner of kitchen scale and mandoline.',
      '- Stove with three burners (primary).',
      '- No kitchen torch available.',
      '',
      '## Specialty Ingredients',
      '- fish sauce',
    ].join('\n');
    mockIngredientCatalog = [];
    mockIngredientSuggestions = [];
    mockUpdateMutate.mockClear();
    mockChatMutate.mockClear();
    mockResolveMutate.mockClear();
    mockUpdateMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mockResolveMutate.mockImplementation((variables, options) =>
      options?.onSuccess?.({
        _id: `ingredient-${variables.name}`,
        canonicalName: variables.name.toLowerCase(),
        normalizedName: variables.name.toLowerCase(),
        displayName: variables.name.charAt(0).toUpperCase() + variables.name.slice(1),
        category: variables.category ?? 'Other',
        aliases: [],
        imageStatus: 'pending',
        imageStyle: 'mise-ingredient-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    mockChatMutate.mockImplementation((_variables, options) =>
      options?.onSuccess?.({ text: 'Profile reviewed.', changedHeadings: [], suggestions: [], complete: false }),
    );
  });

  it('renders dashboard groups from saved markdown', () => {
    render(<PreferencesWorkspace />);

    expect(screen.getByText('Your cooking profile')).toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Teach Mise how you cook, shop, and improvise.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Specialty Ingredients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kitchen').length).toBeGreaterThan(0);
    expect(screen.getByText('Appliances')).toBeInTheDocument();
    expect(screen.getByText('Siemens oven')).toBeInTheDocument();
    expect(screen.getByText('Kitchen scale and mandoline')).toBeInTheDocument();
    expect(screen.getByText('No kitchen torch available')).toBeInTheDocument();
    expect(screen.getAllByText('fish sauce').length).toBeGreaterThan(0);
    expect(mockChatMutate).not.toHaveBeenCalled();
  });

  it('updates markdown when adding a specialty ingredient', () => {
    render(<PreferencesWorkspace />);

    fireEvent.change(screen.getByPlaceholderText('Add an ingredient'), {
      target: { value: 'capers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create "capers"' }));
    expect(screen.getByLabelText('Specialty ingredient category')).toHaveValue(
      'Preserved & Pickled',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockUpdateMutate).toHaveBeenLastCalledWith(
      {
        markdown: [
          '## Safety',
          '- No peanuts',
          '',
          '## Kitchen',
          '- Appliances: Siemens oven, electric grill, portable blender',
          '- Owner of kitchen scale and mandoline.',
          '- Stove with three burners (primary).',
          '- No kitchen torch available.',
          '',
          '## Specialty Ingredients',
          '- fish sauce',
          '- Capers',
        ].join('\n'),
      },
      expect.any(Object),
    );
  });

  it('closes ingredient suggestions when clicking outside', () => {
    mockIngredientSuggestions = [
      {
        _id: 'ingredient-capers',
        canonicalName: 'capers',
        normalizedName: 'capers',
        displayName: 'Capers',
        category: 'Preserved & Pickled',
        aliases: [],
        imageStatus: 'ready',
        imageStyle: 'mise-ingredient-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(<PreferencesWorkspace />);

    fireEvent.change(screen.getByPlaceholderText('Add an ingredient'), {
      target: { value: 'cap' },
    });

    expect(screen.getByText('Capers')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Capers')).not.toBeInTheDocument();
  });

  it('matches saved ingredient aliases to ready catalog illustrations', () => {
    mockMarkdown = ['## Specialty Ingredients', '- cheddar cheese', '- sprig wasabi paste'].join(
      '\n',
    );
    mockIngredientCatalog = [
      {
        _id: 'ingredient-cheddar',
        canonicalName: 'cheddar',
        normalizedName: 'cheddar',
        displayName: 'Cheddar',
        category: 'Cheese & Dairy',
        aliases: ['cheddar cheese'],
        imageStatus: 'ready',
        imageUrl: 'data:image/png;base64,cheddar',
        imageStyle: 'mise-ingredient-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        _id: 'ingredient-wasabi',
        canonicalName: 'wasabi paste',
        normalizedName: 'wasabi paste',
        displayName: 'Wasabi Paste',
        category: 'Condiments & Sauces',
        aliases: ['sprig wasabi paste'],
        imageStatus: 'ready',
        imageUrl: 'data:image/png;base64,wasabi',
        imageStyle: 'mise-ingredient-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const { container } = render(<PreferencesWorkspace />);

    expect(container.querySelectorAll('img[src^="data:image"]')).toHaveLength(2);
    expect(mockResolveMutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cheddar cheese' }),
      expect.any(Object),
    );
    expect(mockResolveMutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sprig wasabi paste' }),
      expect.any(Object),
    );
  });

  it('adds a catalog suggestion without exposing creation fields', () => {
    mockIngredientSuggestions = [
      {
        _id: 'ingredient-capers',
        canonicalName: 'capers',
        normalizedName: 'capers',
        displayName: 'Capers',
        category: 'Preserved & Pickled',
        aliases: [],
        imageStatus: 'ready',
        imageStyle: 'mise-ingredient-v1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(<PreferencesWorkspace />);

    fireEvent.change(screen.getByPlaceholderText('Add an ingredient'), {
      target: { value: 'cap' },
    });

    expect(screen.queryByLabelText('Specialty ingredient category')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Capers'));

    expect(mockUpdateMutate).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Add an ingredient')).toHaveValue('');
  });

  it('updates markdown when removing a specialty ingredient', () => {
    render(<PreferencesWorkspace />);

    fireEvent.click(screen.getByLabelText('Remove specialty ingredient'));

    expect(mockUpdateMutate).toHaveBeenLastCalledWith(
      {
        markdown: [
          '## Safety',
          '- No peanuts',
          '',
          '## Kitchen',
          '- Appliances: Siemens oven, electric grill, portable blender',
          '- Owner of kitchen scale and mandoline.',
          '- Stove with three burners (primary).',
          '- No kitchen torch available.',
        ].join('\n'),
      },
      expect.any(Object),
    );
  });

  it('shows the specialty ingredient builder for an empty profile', () => {
    mockMarkdown = '';

    render(<PreferencesWorkspace />);

    expect(screen.getAllByText('Specialty Ingredients').length).toBeGreaterThan(0);
    const section = screen
      .getByRole('heading', { name: 'Specialty Ingredients' })
      .closest('section');
    expect(screen.getByPlaceholderText('Add an ingredient')).toBeInTheDocument();
    expect(
      within(section as HTMLElement).getByPlaceholderText('Add an ingredient'),
    ).toBeInTheDocument();
  });

  it('opens inline editing from a section edit action', () => {
    render(<PreferencesWorkspace />);

    const safetyCard = screen.getByText('Safety').closest('article');
    expect(safetyCard).not.toBeNull();
    fireEvent.click(within(safetyCard as HTMLElement).getByText('Edit'));

    expect(screen.getByText('Peanuts')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('edits profile details in place while persisting markdown', () => {
    render(<PreferencesWorkspace />);

    const dietCard = screen.getByText('Diet').closest('article');
    expect(dietCard).not.toBeNull();
    fireEvent.click(within(dietCard as HTMLElement).getByText('Edit'));

    // Toggle Vegan preset
    fireEvent.click(screen.getByText('Vegan'));
    fireEvent.click(screen.getByText('Save Changes'));

    expect(mockUpdateMutate).toHaveBeenLastCalledWith(
      {
        markdown: [
          '## Safety',
          '- No peanuts',
          '',
          '## Diet',
          '- Vegan',
          '',
          '## Kitchen',
          '- Appliances: Siemens oven, electric grill, portable blender',
          '- Owner of kitchen scale and mandoline.',
          '- Stove with three burners (primary).',
          '- No kitchen torch available.',
          '',
          '## Specialty Ingredients',
          '- fish sauce',
        ].join('\n'),
      },
      expect.any(Object),
    );
  });

  it('opens the agent dialog from the profile preview action', () => {
    render(<PreferencesWorkspace />);

    fireEvent.click(screen.getByText('Ask Mise to refine'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
