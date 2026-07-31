import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const viewportWidths = [320, 375, 414, 768] as const;
const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/cook'] as const;
const authenticatedRoutes = [
  '/recipes',
  '/imports',
  '/shopping',
  '/preferences',
  '/skills',
] as const;

const routeReadyTargets = {
  '/': 'landing-page',
  '/login': 'auth-shell',
  '/register': 'auth-shell',
  '/forgot-password': 'auth-shell',
  '/recipes': 'recipes-page',
  '/imports': 'imports-page',
  '/shopping': 'shopping-page',
  '/preferences': 'preferences-page',
  '/skills': 'skills-page',
} as const;

async function waitForRouteReady(page: Page, route: string) {
  if (route === '/cook') {
    await expect(page.getByTestId('text-input')).toBeVisible();
    return;
  }

  const testId = routeReadyTargets[route as keyof typeof routeReadyTargets];
  const routeRoot = page.getByTestId(testId);
  await expect(routeRoot).toBeVisible();

  if (authenticatedRoutes.includes(route as (typeof authenticatedRoutes)[number])) {
    await expect(routeRoot).toHaveAttribute('aria-busy', 'false');
  }
}

async function expectNoDocumentOverflow(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test.describe('responsive public routes', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of viewportWidths) {
    for (const route of publicRoutes) {
      test(`${route} has no horizontal page overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route);
        await waitForRouteReady(page, route);
        await expectNoDocumentOverflow(page);
      });
    }
  }
});

test.describe('responsive authenticated routes', () => {
  for (const width of viewportWidths) {
    for (const route of authenticatedRoutes) {
      test(`${route} has no horizontal page overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}(?:[/?#]|$)`));
        await waitForRouteReady(page, route);
        await expectNoDocumentOverflow(page);
      });
    }
  }
});

test('mobile shell and desktop utilities do not overlap at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 844 });
  await page.goto('/cook');
  await waitForRouteReady(page, '/cook');
  await expect(page.getByRole('button', { name: /open.*sidebar/i })).toBeHidden();
  const composerHasFixedAncestor = await page.getByTestId('text-input').evaluate((input) => {
    let node: HTMLElement | null = input;
    while (node) {
      if (window.getComputedStyle(node).position === 'fixed') {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  });
  expect(composerHasFixedAncestor).toBe(false);
});

test('the viewport opts into safe-area layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
});

test('primary collection controls meet the mobile tap-area floor', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });

  await page.goto('/recipes');
  await waitForRouteReady(page, '/recipes');
  await expect(page.getByRole('tab').first()).toHaveCSS('height', '44px');

  await page.goto('/imports');
  await waitForRouteReady(page, '/imports');
  await expect(page.getByRole('tab').first()).toHaveCSS('height', '44px');

  await page.goto('/shopping');
  await waitForRouteReady(page, '/shopping');
  await expect(page.getByRole('button', { name: /add item/i })).toHaveCSS('height', '44px');
});

test('collection filter surfaces stay inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });

  await page.goto('/recipes');
  await waitForRouteReady(page, '/recipes');
  await page.getByRole('button', { name: /filters/i }).first().click();
  await expect(page.getByRole('button', { name: /close filters/i }).first()).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.goto('/imports');
  await waitForRouteReady(page, '/imports');
  const importsFilters = page.getByRole('button', { name: /filters/i }).first();
  await importsFilters.click();
  await expect(importsFilters).toHaveAttribute('aria-expanded', 'true');
  await expectNoDocumentOverflow(page);
});

test('a populated collection with a long recipe title remains responsive', async ({ page }) => {
  await page.route(/\/api\/recipes(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        recipes: [
          {
            _id: 'responsive-recipe',
            user: 'responsive-test-user',
            title:
              'A deliberately long weeknight recipe title that must wrap without widening the page',
            documentType: 'recipe',
            shortDescription: 'A deterministic responsive-layout fixture.',
            saveList: 'want_to_cook',
            collections: [],
            favorite: false,
            pinned: false,
            categorizationStatus: 'complete',
            categorizationVersion: 1,
            servings: 4,
            totalMinutes: 35,
            createdAt: '2026-07-31T00:00:00.000Z',
            updatedAt: '2026-07-31T00:00:00.000Z',
          },
        ],
        total: 1,
      }),
    });
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/recipes');
  await waitForRouteReady(page, '/recipes');
  await expect(page.locator('article')).toHaveCount(1);
  await expectNoDocumentOverflow(page);
});
