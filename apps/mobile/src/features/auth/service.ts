import { publicApiFetch } from '@/lib/api/client';
import { getMobileDevice } from './device';
import type { LoginResponse, TokenResponse } from './types';

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return publicApiFetch('/api/auth/mobile/login', {
      method: 'POST',
      body: { email, password, ...(await getMobileDevice()) },
    });
  },
  async verifyTwoFactor(tempToken: string, code: string, recovery: boolean) {
    return publicApiFetch<TokenResponse>('/api/auth/mobile/2fa/verify', {
      method: 'POST',
      body: {
        tempToken,
        ...(await getMobileDevice()),
        ...(recovery ? { backupCode: code } : { token: code }),
      },
    });
  },
  refresh(refreshToken: string) {
    return publicApiFetch<TokenResponse>('/api/auth/mobile/refresh', {
      method: 'POST',
      body: { refreshToken },
    });
  },
  register(input: { name: string; username: string; email: string; password: string }) {
    return publicApiFetch<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: { ...input, confirm_password: input.password },
    });
  },
  requestPasswordReset(email: string) {
    return publicApiFetch<{ message: string }>('/api/auth/requestPasswordReset', {
      method: 'POST',
      body: { email },
    });
  },
  logout(accessToken: string, refreshToken: string) {
    return publicApiFetch<{ message: string }>('/api/auth/mobile/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { refreshToken },
    });
  },
};
