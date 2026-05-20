import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';

export const MISE_DEFAULT_ENDPOINT = 'OpenRouter';
export const MISE_DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

const migrationKey = 'mise.defaultModelPreference.v1';

export function getMiseDefaultPreset(): TPreset {
  return {
    endpoint: MISE_DEFAULT_ENDPOINT,
    endpointType: EModelEndpoint.custom,
    model: MISE_DEFAULT_MODEL,
  } as TPreset;
}

export function ensureMiseDefaultModelPreference() {
  if (typeof window === 'undefined' || localStorage.getItem(migrationKey) === 'true') {
    return false;
  }

  let changed = false;
  const lastModelRaw = localStorage.getItem(LocalStorageKeys.LAST_MODEL);
  if (lastModelRaw) {
    try {
      const lastModels = JSON.parse(lastModelRaw) as Record<string, string | undefined>;
      if (lastModels?.[MISE_DEFAULT_ENDPOINT] !== MISE_DEFAULT_MODEL) {
        lastModels[MISE_DEFAULT_ENDPOINT] = MISE_DEFAULT_MODEL;
        localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastModels));
        changed = true;
      }
    } catch {
      localStorage.removeItem(LocalStorageKeys.LAST_MODEL);
      changed = true;
    }
  }

  const setupKey = `${LocalStorageKeys.LAST_CONVO_SETUP}_0`;
  const setupRaw = localStorage.getItem(setupKey);
  if (setupRaw) {
    try {
      const setup = JSON.parse(setupRaw) as { endpoint?: string; model?: string };
      if (setup?.endpoint === MISE_DEFAULT_ENDPOINT && setup.model !== MISE_DEFAULT_MODEL) {
        setup.model = MISE_DEFAULT_MODEL;
        localStorage.setItem(setupKey, JSON.stringify(setup));
        changed = true;
      }
    } catch {
      localStorage.removeItem(setupKey);
      changed = true;
    }
  }

  localStorage.setItem(migrationKey, 'true');
  return changed;
}
