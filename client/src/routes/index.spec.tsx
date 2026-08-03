import { matchRoutes } from 'react-router-dom';
import { router } from './index';

describe('public routes', () => {
  test.each([
    ['/r/6a633f83af70a5fc76797f1f', 'r/:recipeId'],
    ['/cooks/6a633f83af70a5fc76797f1f/sahil', 'cooks/:userId/:slug?'],
  ])('matches a direct navigation to %s', (pathname, expectedPath) => {
    const matches = matchRoutes(router.routes, pathname);

    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
  });

  test('does not expose public content beneath the OAuth namespace', () => {
    expect(matchRoutes(router.routes, '/oauth/r/6a633f83af70a5fc76797f1f')).toBeNull();
  });
});
