import type { TSubmission } from 'librechat-data-provider';

export function usesDirectSSE(submission: TSubmission | null): boolean {
  const clientOptions = submission?.endpointOption?.clientOptions;
  return clientOptions?.cookingBridge === true || clientOptions?.guestCookingBridge === true;
}

export function isGuestCookingSubmission(submission: TSubmission): boolean {
  return submission.endpointOption?.clientOptions?.guestCookingBridge === true;
}

export function shouldNavigateAfterFinal(submission: TSubmission): boolean {
  return !isGuestCookingSubmission(submission);
}
