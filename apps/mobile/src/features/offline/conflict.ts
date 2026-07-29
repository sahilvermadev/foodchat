export type MutationFailureDisposition = 'conflict' | 'resolved' | 'retry';

export function mutationFailureDisposition(
  status: number | undefined,
  deleting: boolean,
): MutationFailureDisposition {
  if (deleting && status === 404) return 'resolved';
  if (status != null && status < 500) return 'conflict';
  return 'retry';
}
