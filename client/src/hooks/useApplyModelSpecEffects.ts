import { useCallback } from 'react';
import { Constants } from 'librechat-data-provider';
import type { TStartupConfig } from 'librechat-data-provider';
import { useUpdateEphemeralAgent } from '~/store/agents';
import { getModelSpec, applyModelSpecEphemeralAgent } from '~/utils';

export default function useApplyModelSpecEffects() {
  const updateEphemeralAgent = useUpdateEphemeralAgent();

  return useCallback(
    ({
      convoId,
      specName,
      startupConfig,
    }: {
      convoId: string | null;
      specName?: string | null;
      startupConfig?: TStartupConfig;
    }) => {
      if (!specName) {
        if (startupConfig?.modelSpecs?.list?.length) {
          updateEphemeralAgent((convoId ?? Constants.NEW_CONVO) || Constants.NEW_CONVO, null);
        }
        return;
      }

      applyModelSpecEphemeralAgent({
        convoId,
        modelSpec: getModelSpec({ specName, startupConfig }),
        updateEphemeralAgent,
      });
    },
    [updateEphemeralAgent],
  );
}
