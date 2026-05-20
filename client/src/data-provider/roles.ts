import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  dataService,
  agentPermissionsSchema,
  skillPermissionsSchema,
  memoryPermissionsSchema,
  peoplePickerPermissionsSchema,
  remoteAgentsPermissionsSchema,
} from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseMutationResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useGetRole = (
  roleName: string,
  config?: UseQueryOptions<t.TRole>,
): QueryObserverResult<t.TRole> => {
  return useQuery<t.TRole>([QueryKeys.roles, roleName], () => dataService.getRole(roleName), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useListRoles = (
  config?: UseQueryOptions<t.ListRolesResponse>,
): QueryObserverResult<t.ListRolesResponse> => {
  return useQuery<t.ListRolesResponse>([QueryKeys.rolesList], () => dataService.listRoles(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useUpdateAgentPermissionsMutation = (
  options?: t.UpdateAgentPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateAgentPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      agentPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateAgentPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess != null) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update agent permissions:', error);
        }
        if (onError != null) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateSkillPermissionsMutation = (
  options?: t.UpdateSkillPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateSkillPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      skillPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateSkillPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update skill permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMemoryPermissionsMutation = (
  options?: t.UpdateMemoryPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMemoryPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      memoryPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMemoryPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update memory permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdatePeoplePickerPermissionsMutation = (
  options?: t.UpdatePeoplePickerPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePeoplePickerPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      peoplePickerPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePeoplePickerPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update people picker permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateRemoteAgentsPermissionsMutation = (
  options?: t.UpdateRemoteAgentsPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateRemoteAgentsPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      remoteAgentsPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateRemoteAgentsPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update remote agents permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};
