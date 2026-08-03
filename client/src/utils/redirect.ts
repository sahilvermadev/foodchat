export const REDIRECT_PARAM = 'redirect_to';
export const SESSION_KEY = 'post_login_redirect_to';
export const EXPLICIT_LOGOUT_KEY = 'rekky_explicit_logout';
export const AUTH_PARAM = 'auth';
export const AUTH_TOKEN_PARAM = 'auth_token';

export type AuthMode = 'login' | 'register' | 'forgot' | '2fa';

const AUTH_MODES = new Set<AuthMode>(['login', 'register', 'forgot', '2fa']);

export function markExplicitLogout(): void {
  localStorage.setItem(EXPLICIT_LOGOUT_KEY, Date.now().toString());
}

export function clearExplicitLogout(): void {
  localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
}

export function hasExplicitlyLoggedOut(): boolean {
  return localStorage.getItem(EXPLICIT_LOGOUT_KEY) != null;
}

export function getAuthMode(searchParams: URLSearchParams): AuthMode | null {
  const mode = searchParams.get(AUTH_PARAM);
  return mode != null && AUTH_MODES.has(mode as AuthMode) ? (mode as AuthMode) : null;
}

export function setAuthMode(search: string, mode: AuthMode, tempToken?: string): string {
  const params = new URLSearchParams(search);
  params.set(AUTH_PARAM, mode);
  if (mode === '2fa' && tempToken) {
    params.set(AUTH_TOKEN_PARAM, tempToken);
  } else {
    params.delete(AUTH_TOKEN_PARAM);
  }
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

export function clearAuthParams(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(AUTH_PARAM);
  params.delete(AUTH_TOKEN_PARAM);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

export function getPublicReturnTarget(pathname: string, search: string, hash: string): string {
  return `${pathname}${clearAuthParams(search)}${hash}`;
}

/** Matches `/login` as a full path segment, with optional basename prefix (e.g. `/librechat/login/2fa`) */
const LOGIN_PATH_RE = /(?:^|\/)login(?:\/|$)/;

/** Validates that a redirect target is a safe relative path (not an absolute or protocol-relative URL) */
export function isSafeRedirect(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return false;
  }
  try {
    const base = new URL('https://rekky.invalid');
    const resolved = new URL(url, base);
    return resolved.origin === base.origin && !LOGIN_PATH_RE.test(resolved.pathname);
  } catch {
    return false;
  }
}

/**
 * Resolves the post-login redirect from URL params and sessionStorage,
 * cleans up both sources, and returns the validated target (or null).
 */
export function getPostLoginRedirect(searchParams: URLSearchParams): string | null {
  const urlRedirect = searchParams.get(REDIRECT_PARAM);
  const storedRedirect = sessionStorage.getItem(SESSION_KEY);

  const target = urlRedirect ?? storedRedirect;

  if (storedRedirect) {
    sessionStorage.removeItem(SESSION_KEY);
  }

  if (target == null || !isSafeRedirect(target)) {
    return null;
  }

  return target;
}

export function resolvePostLoginRedirect(
  searchParams: URLSearchParams,
  fallback?: string,
): string | null {
  const redirect = getPostLoginRedirect(searchParams);
  if (redirect) {
    return redirect;
  }
  return fallback && isSafeRedirect(fallback) ? fallback : null;
}

/**
 * Contextual auth always enters the application after success. Standalone auth
 * continues to honor safe deep links used by protected routes.
 */
export function resolveAuthSuccessRedirect(searchParams: URLSearchParams): string {
  if (getAuthMode(searchParams)) {
    sessionStorage.removeItem(SESSION_KEY);
    return '/cook';
  }
  return resolvePostLoginRedirect(searchParams, '/cook') ?? '/cook';
}

export function buildLoginRetryRedirect(searchParams: URLSearchParams): string {
  const redirect = searchParams.get(REDIRECT_PARAM);
  return redirect && isSafeRedirect(redirect)
    ? `/login?${REDIRECT_PARAM}=${encodeURIComponent(redirect)}`
    : '/login';
}

export function buildTwoFactorRedirect(tempToken?: string): string {
  if (!tempToken) {
    return '/login/2fa';
  }
  return `/login/2fa?tempToken=${encodeURIComponent(tempToken)}`;
}

export function buildContextualTwoFactorRedirect(search: string, tempToken?: string): string {
  return setAuthMode(search, '2fa', tempToken);
}

export function persistRedirectToSession(value: string): void {
  if (isSafeRedirect(value)) {
    sessionStorage.setItem(SESSION_KEY, value);
  }
}
