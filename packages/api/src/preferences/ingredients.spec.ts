import {
  getSpecialtyIngredientImage,
  listSpecialtyIngredients,
  normalizeSpecialtyIngredientName,
  resolveSpecialtyIngredient,
} from './ingredients';

const mockCreate = jest.fn();
const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const mockUpdateOne = jest.fn();

jest.mock('mongoose', () => ({
  __esModule: true,
  default: {
    model: () => ({
      create: (...args: unknown[]) => mockCreate(...args),
      find: (...args: unknown[]) => mockFind(...args),
      findById: (...args: unknown[]) => mockFindById(...args),
      findOne: (...args: unknown[]) => mockFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    }),
    models: {
      SpecialtyIngredient: {
        create: (...args: unknown[]) => mockCreate(...args),
        find: (...args: unknown[]) => mockFind(...args),
        findById: (...args: unknown[]) => mockFindById(...args),
        findOne: (...args: unknown[]) => mockFindOne(...args),
        findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
        updateMany: (...args: unknown[]) => mockUpdateMany(...args),
        updateOne: (...args: unknown[]) => mockUpdateOne(...args),
      },
    },
  },
}));

jest.mock('@librechat/data-schemas', () => ({
  specialtyIngredientSchema: {},
}));

describe('specialty ingredient catalog', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFind.mockReset();
    mockFindById.mockReset();
    mockFindOne.mockReset();
    mockFindOneAndUpdate.mockReset();
    mockUpdateMany.mockReset().mockResolvedValue({});
    mockUpdateOne.mockReset();
  });

  test.each([
    ['Gochujang paste', 'gochujang'],
    ['bottle of fish sauce', 'fish sauce'],
    ['a bottle of fish sauce', 'fish sauce'],
    ['sprig wasabi', 'wasabi'],
    ['Cheddar Cheese', 'cheddar'],
    ['capers', 'capers'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSpecialtyIngredientName(input)).toBe(expected);
  });

  test('reuses an existing catalog ingredient before creating a new one', async () => {
    mockFindOne.mockResolvedValue({
      _id: { toString: () => 'ingredient-1' },
      canonicalName: 'gochujang',
      normalizedName: 'gochujang',
      displayName: 'Gochujang',
      category: 'Condiments & Sauces',
      aliases: ['gochujang paste'],
      imageStatus: 'ready',
      imageUrl: 'data:image/png;base64,abc',
      imagePrompt: 'prompt',
      imageStyle: 'mise-ingredient-v1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(resolveSpecialtyIngredient({ name: 'gochujang paste' })).resolves.toMatchObject({
      _id: 'ingredient-1',
      displayName: 'Gochujang',
      imageUrl: '/api/preferences/ingredients/ingredient-1/image?v=1767225600000&variant=thumbnail',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('reuses a catalog ingredient created by a concurrent request', async () => {
    const duplicate = {
      _id: { toString: () => 'ingredient-2' },
      canonicalName: 'miso',
      normalizedName: 'miso',
      displayName: 'Miso',
      category: 'Condiments & Sauces',
      aliases: [],
      imageStatus: 'ready',
      imageStyle: 'mise-ingredient-v1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    mockFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(duplicate);
    mockCreate.mockRejectedValueOnce({ code: 11000 });

    await expect(resolveSpecialtyIngredient({ name: 'miso' })).resolves.toMatchObject({
      _id: 'ingredient-2',
      displayName: 'Miso',
    });
  });

  test('rejects a category outside the supported catalog values', async () => {
    await expect(
      resolveSpecialtyIngredient({
        name: 'miso',
        category: 'Shelf' as never,
      }),
    ).rejects.toThrow('Ingredient category is invalid.');
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  test('does not retry a failed illustration while reading catalog suggestions', async () => {
    mockFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            {
              _id: { toString: () => 'ingredient-3' },
              canonicalName: 'harissa',
              normalizedName: 'harissa',
              displayName: 'Harissa',
              category: 'Condiments & Sauces',
              aliases: [],
              imageStatus: 'failed',
              imageStyle: 'mise-ingredient-v1',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ]),
        }),
      }),
    });

    await listSpecialtyIngredients('');

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('claims a new illustration atomically before generation starts', async () => {
    const pending = {
      _id: { toString: () => 'ingredient-4' },
      canonicalName: 'harissa',
      normalizedName: 'harissa',
      displayName: 'Harissa',
      category: 'Condiments & Sauces',
      aliases: [],
      imageStatus: 'pending',
      imageStyle: 'mise-ingredient-v1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue(pending);
    mockFindOneAndUpdate.mockResolvedValue(null);

    await resolveSpecialtyIngredient({ name: 'harissa' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'ingredient-4',
        imageStyle: 'mise-ingredient-v1',
        imageStatus: 'pending',
      },
      { $set: { imageStatus: 'generating' } },
      { new: true },
    );
  });

  test('migrates a legacy encoded illustration while serving its thumbnail', async () => {
    const legacyDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    mockFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'ingredient-1',
        imageUrl: legacyDataUrl,
      }),
    });
    mockUpdateOne.mockResolvedValue({});

    const thumbnail = await getSpecialtyIngredientImage('ingredient-1');

    expect(thumbnail?.contentType).toBe('image/webp');
    expect(thumbnail?.buffer.length).toBeGreaterThan(0);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'ingredient-1' },
      {
        $set: {
          imageData: expect.any(Buffer),
          imageContentType: 'image/png',
          imageThumbnail: expect.any(Buffer),
        },
        $unset: { imageUrl: 1 },
      },
      { timestamps: false },
    );
  });
});
