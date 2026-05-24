import type { EModelEndpoint, ArtifactModes } from 'librechat-data-provider';

/**
 * Artifact rendering has been removed from the client surface in this fork.
 * Returning null keeps model prompts aligned with the UI so assistants do not
 * emit artifact directives that would degrade into plain file/text attachments.
 */
export function generateArtifactsPrompt(_params: {
  endpoint: EModelEndpoint | string;
  artifacts: ArtifactModes;
}): string | null {
  return null;
}
