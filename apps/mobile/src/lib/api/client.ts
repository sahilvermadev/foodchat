import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';

import { tokenVault } from '@/lib/auth/token-vault';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
export const apiUrl =
  typeof configuredApiUrl === 'string' ? configuredApiUrl.replace(/\/$/, '') : 'https://rekky.ai';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequest = Omit<RequestInit, 'body'> & { body?: BodyInit | object };
type RefreshHandler = () => Promise<boolean>;
let refreshHandler: RefreshHandler | null = null;
let refreshPromise: Promise<boolean> | null = null;

export const configureAuthRefresh = (handler: RefreshHandler) => {
  refreshHandler = handler;
};

const execute = async <T>(
  path: string,
  request: ApiRequest,
  authenticated: boolean,
): Promise<T> => {
  const headers = new Headers(request.headers);
  const token = tokenVault.getAccessToken();
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`);
  let body = request.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}${path}`, { ...request, headers, body });
  if (!response.ok) {
    let message = 'Rekky could not complete that request.';
    const responseText = await response.text();
    try {
      const payload = JSON.parse(responseText) as { message?: string };
      message = payload.message ?? message;
    } catch {
      message = responseText || message;
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const responseError = async (response: Response): Promise<ApiError> => {
  let message = 'Rekky could not complete that request.';
  const responseText = await response.text();
  try {
    const payload = JSON.parse(responseText) as { error?: string; message?: string };
    message = payload.message ?? payload.error ?? message;
  } catch {
    message = responseText || message;
  }
  return new ApiError(message, response.status);
};

const executeResponse = async (path: string, request: ApiRequest): Promise<Response> => {
  const headers = new Headers(request.headers);
  const token = tokenVault.getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = request.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}${path}`, { ...request, headers, body });
  if (!response.ok) throw await responseError(response);
  return response;
};

export async function authenticatedApiResponse(
  path: string,
  request: ApiRequest = {},
): Promise<Response> {
  try {
    return await executeResponse(path, request);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !refreshHandler) throw error;
    refreshPromise ??= refreshHandler().finally(() => {
      refreshPromise = null;
    });
    if (!(await refreshPromise)) throw error;
    return executeResponse(path, request);
  }
}

export const publicApiFetch = <T>(path: string, request: ApiRequest = {}) =>
  execute<T>(path, request, false);

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  try {
    return await execute<T>(path, request, true);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !refreshHandler) throw error;
    refreshPromise ??= refreshHandler().finally(() => {
      refreshPromise = null;
    });
    if (!(await refreshPromise)) throw error;
    return execute<T>(path, request, true);
  }
}
