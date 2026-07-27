const technicalError =
  /(?:connectexception|failed to connect|network request failed|fetch failed|econn|java\.net|127\.0\.0\.1|localhost|stack trace|socket)/i;

export function userErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message || technicalError.test(message)) return fallback;
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  if (status && status >= 400 && status < 500) return message;
  return fallback;
}
