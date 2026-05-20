import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { Constants, LocalStorageKeys, AgentCapabilities } from 'librechat-data-provider';
import { getTimestampedValue } from '~/utils/timestamps';
import { useGetStartupConfig } from '~/data-provider';
import useLocalStorage from '~/hooks/useLocalStorageAlt';
import { ephemeralAgentByConvoId } from '~/store';

type ToolValue = boolean | string;

function useCapabilityToggle({
  conversationId,
  storageContextKey,
  toolKey,
  localStorageKey,
}: {
  conversationId?: string | null;
  storageContextKey?: string;
  toolKey: string;
  localStorageKey: LocalStorageKeys;
}) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const [isPinned, setIsPinned] = useLocalStorage<boolean>(`${localStorageKey}pinned`, false);
  const storageKey = `${localStorageKey}${key}`;
  const toolValue = ephemeralAgent?.[toolKey] ?? false;
  const isToolEnabled = typeof toolValue === 'string' ? toolValue.length > 0 : toolValue === true;

  useEffect(() => {
    const value = ephemeralAgent?.[toolKey];
    if (value !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(value));
    }
  }, [ephemeralAgent, storageKey, toolKey]);

  const handleChange = useCallback(
    ({ value }: { e?: React.ChangeEvent<HTMLInputElement>; value: ToolValue }) => {
      setEphemeralAgent((prev) => ({
        ...(prev || {}),
        [toolKey]: value,
      }));

      if (storageContextKey) {
        localStorage.setItem(`${localStorageKey}${storageContextKey}`, JSON.stringify(value));
      }
    },
    [localStorageKey, setEphemeralAgent, storageContextKey, toolKey],
  );

  const debouncedChange = useMemo(
    () => debounce(handleChange, 50, { leading: true }),
    [handleChange],
  );

  return {
    toggleState: toolValue,
    handleChange,
    isToolEnabled,
    toolValue,
    setToggleState: (value: ToolValue) => handleChange({ value }),
    ephemeralAgent,
    debouncedChange,
    setEphemeralAgent,
    authData: undefined,
    isPinned,
    setIsPinned,
  };
}

interface BadgeRowContextType {
  conversationId?: string | null;
  storageContextKey?: string;
  skills: ReturnType<typeof useCapabilityToggle>;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  return useContext(BadgeRowContext);
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  isSubmitting?: boolean;
  conversationId?: string | null;
  specName?: string | null;
}

export default function BadgeRowProvider({
  children,
  isSubmitting,
  conversationId,
  specName,
}: BadgeRowProviderProps) {
  const lastContextKeyRef = useRef<string>('');
  const hasInitializedRef = useRef(false);
  const { data: startupConfig } = useGetStartupConfig();
  const key = conversationId ?? Constants.NEW_CONVO;
  const hasModelSpecs = (startupConfig?.modelSpecs?.list?.length ?? 0) > 0;

  /**
   * Compute the storage context key for non-spec persistence:
   * - `__defaults__`: specs configured but none active → shared defaults key
   * - undefined: spec active (no persistence) or no specs configured (original behavior)
   *
   * When a spec is active, tool/MCP state is NOT persisted — the admin's spec
   * configuration is always applied fresh. Only non-spec user preferences persist.
   */
  const storageContextKey = useMemo(() => {
    if (!specName && hasModelSpecs) {
      return Constants.spec_defaults_key as string;
    }
    return undefined;
  }, [specName, hasModelSpecs]);

  /**
   * Compute the storage suffix for reading localStorage defaults:
   * - New conversations read from environment key (spec or non-spec defaults)
   * - Existing conversations read from conversation key (per-conversation state)
   */
  const isNewConvo = key === Constants.NEW_CONVO;
  const storageSuffix = isNewConvo && storageContextKey ? storageContextKey : key;

  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));

  /** Initialize ephemeralAgent from localStorage on mount and when conversation/spec changes.
   *  Skipped when a spec is active — applyModelSpecEphemeralAgent handles both new conversations
   *  (pure spec values) and existing conversations (spec values + localStorage overrides). */
  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    if (specName) {
      // Spec active: applyModelSpecEphemeralAgent handles all state (spec base + localStorage
      // overrides for existing conversations). Reset init flag so switching back to non-spec
      // triggers a fresh re-init.
      hasInitializedRef.current = false;
      return;
    }
    // Check if this is a new conversation/spec or the first load
    if (!hasInitializedRef.current || lastContextKeyRef.current !== storageSuffix) {
      hasInitializedRef.current = true;
      lastContextKeyRef.current = storageSuffix;

      const skillsToggleKey = `${LocalStorageKeys.LAST_SKILLS_TOGGLE_}${storageSuffix}`;

      const skillsToggleValue = getTimestampedValue(skillsToggleKey);

      const initialValues: Record<string, boolean | string> = {};

      if (skillsToggleValue !== null) {
        try {
          initialValues[AgentCapabilities.skills] = JSON.parse(skillsToggleValue);
        } catch (e) {
          console.error('Failed to parse skills toggle value:', e);
        }
      }

      const hasOverrides = Object.keys(initialValues).length > 0;

      setEphemeralAgent((prev) => {
        if (prev == null) {
          /** ephemeralAgent is null — use localStorage defaults */
          if (hasOverrides) {
            return { ...initialValues };
          }
          return prev;
        }
        /** ephemeralAgent already has values (from prior state).
         *  Only fill in undefined keys from localStorage. */
        let changed = false;
        const result = { ...prev };
        for (const [toolKey, value] of Object.entries(initialValues)) {
          if (result[toolKey] === undefined) {
            result[toolKey] = value;
            changed = true;
          }
        }
        return changed ? result : prev;
      });
    }
  }, [storageSuffix, specName, isSubmitting, setEphemeralAgent]);

  /** Skills hook - using a custom key since it's not a Tool but a capability */
  const skills = useCapabilityToggle({
    conversationId,
    storageContextKey,
    toolKey: AgentCapabilities.skills,
    localStorageKey: LocalStorageKeys.LAST_SKILLS_TOGGLE_,
  });

  const value: BadgeRowContextType = {
    skills,
    conversationId,
    storageContextKey,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
