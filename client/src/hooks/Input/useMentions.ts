import { useMemo } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  alternateName,
  isAgentsEndpoint,
  getConfigDefaults,
} from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import {
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { mapEndpoints } from '~/utils';
import { EndpointIcon } from '~/components/Endpoints';

const defaultInterface = getConfigDefaults().interface;

export default function useMentions() {
  const { data: modelsConfig, isLoading: isLoadingModels } = useGetModelsQuery();
  const { data: startupConfig, isLoading: isLoadingStartup } = useGetStartupConfig();
  const { data: endpointsConfig, isLoading: isLoadingEndpoints } = useGetEndpointsQuery();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig?.interface],
  );

  const modelSpecs = useMemo(() => {
    const specs = startupConfig?.modelSpecs?.list ?? [];
    return specs.filter((spec) => !isAgentsEndpoint(spec.preset?.endpoint));
  }, [startupConfig]);

  const options: MentionOption[] = useMemo(() => {
    const validEndpoints = endpoints.filter((endpoint) => !isAgentsEndpoint(endpoint));

    const modelOptions = validEndpoints.flatMap((endpoint) => {
      if (isAgentsEndpoint(endpoint)) {
        return [];
      }

      if (interfaceConfig.modelSelect !== true) {
        return [];
      }

      const models = (modelsConfig?.[endpoint] ?? []).map((model) => ({
        value: endpoint,
        label: model,
        type: 'model' as const,
        icon: EndpointIcon({
          conversation: { endpoint, model },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      }));
      return models;
    });

    const mentions = [
      ...(modelSpecs.length > 0 ? modelSpecs : []).map((modelSpec) => ({
        value: modelSpec.name,
        label: modelSpec.label,
        description: modelSpec.description,
        icon: EndpointIcon({
          conversation: {
            ...modelSpec.preset,
            iconURL: modelSpec.iconURL,
          },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
        type: 'modelSpec' as const,
      })),
      ...(interfaceConfig.modelSelect === true ? validEndpoints : []).map((endpoint) => ({
        value: endpoint,
        label: alternateName[endpoint as string] ?? endpoint ?? '',
        type: 'endpoint' as const,
        icon: EndpointIcon({
          conversation: { endpoint },
          endpointsConfig,
          context: 'menu-item',
          size: 20,
        }),
      })),
      ...modelOptions,
    ];

    return mentions;
  }, [
    endpoints,
    modelSpecs,
    modelsConfig,
    endpointsConfig,
    interfaceConfig.modelSelect,
  ]);

  const isLoading =
    isLoadingModels ||
    isLoadingStartup ||
    isLoadingEndpoints;

  return {
    options,
    presets: [],
    isLoading,
    modelSpecs,
    agentsList: [],
    modelsConfig,
    endpointsConfig,
  };
}
