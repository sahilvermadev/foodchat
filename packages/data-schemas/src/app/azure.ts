import logger from '~/config/winston';
import { EModelEndpoint, validateAzureGroups } from 'librechat-data-provider';
import type { TCustomConfig, TAzureConfig } from 'librechat-data-provider';

/**
 * Sets up the Azure OpenAI configuration from the config (`librechat.yaml`) file.
 * @param config - The loaded custom configuration.
 * @returns The Azure OpenAI configuration.
 */
export function azureConfigSetup(config: Partial<TCustomConfig>): TAzureConfig {
  const azureConfig = config.endpoints?.[EModelEndpoint.azureOpenAI];
  if (!azureConfig) {
    throw new Error('Azure OpenAI configuration is missing.');
  }
  const { groups, ...azureConfiguration } = azureConfig;
  const { isValid, modelNames, modelGroupMap, groupMap, errors } = validateAzureGroups(groups);

  if (!isValid) {
    const errorString = errors.join('\n');
    const errorMessage = 'Invalid Azure OpenAI configuration:\n' + errorString;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return {
    errors,
    isValid,
    groupMap,
    modelNames,
    modelGroupMap,
    ...azureConfiguration,
  };
}
