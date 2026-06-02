import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Root from './Root';
import { CookingSession, RecipeDetail, RecipeLibrary } from '~/components/Cooking';
import { PreferencesWorkspace } from '~/components/Preferences';

const AuthProviderLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const loadSkillsView = () =>
  import('~/components/Skills/layouts/SkillsView').then((m) => ({
    Component: m.default,
  }));

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: 'login',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [{ index: true, element: <Login /> }],
    },
    {
      path: 'login/2fa',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [{ index: true, element: <TwoFactorScreen /> }],
    },
    {
      path: 'register',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [{ index: true, element: <Registration /> }],
    },
    {
      path: 'forgot-password',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [{ index: true, element: <RequestPasswordReset /> }],
    },
    {
      path: 'reset-password',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [{ index: true, element: <ResetPassword /> }],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthProviderLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <Root />,
          children: [
            {
              index: true,
              element: <Navigate to="/cook" replace={true} />,
            },
            {
              path: 'cook',
              element: <ChatRoute mode="cooking" />,
            },
            {
              path: 'cook/sessions/:sessionId',
              element: <CookingSession />,
            },
            {
              path: 'cook/:conversationId',
              element: <ChatRoute mode="cooking" />,
            },
            {
              path: 'recipes',
              element: <RecipeLibrary />,
            },
            {
              path: 'recipes/:recipeId',
              element: <RecipeDetail />,
            },
            {
              path: 'preferences',
              element: <PreferencesWorkspace />,
            },
            {
              path: 'skills',
              lazy: loadSkillsView,
            },
            {
              path: 'skills/:skillId',
              lazy: loadSkillsView,
            },
            {
              path: 'skills/:skillId/edit',
              lazy: loadSkillsView,
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
