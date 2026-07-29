import { useEffect, useRef, useState } from 'react';
import type { RecipeWorkspaceState } from 'librechat-data-provider';

type WorkspaceUpdate = Omit<RecipeWorkspaceState, 'updatedAt'>;
type WorkspacePersist = (state: WorkspaceUpdate) => Promise<void> | void;

const timestamp = (state?: RecipeWorkspaceState) => {
  const value = state?.updatedAt ? Date.parse(state.updatedAt) : 0;
  return Number.isFinite(value) ? value : 0;
};

const settlePersistence = async (persist: WorkspacePersist | undefined, state: WorkspaceUpdate) => {
  try {
    await persist?.(state);
  } catch {
    return;
  }
};

export default function useRecipeWorkspace(
  remoteState?: RecipeWorkspaceState,
  persist?: WorkspacePersist,
): [RecipeWorkspaceState | undefined, (state: WorkspaceUpdate) => void] {
  const [state, setState] = useState(remoteState);
  const stateRef = useRef(state);
  const persistRef = useRef(persist);
  const activePersistRef = useRef(false);
  const pendingPersistRef = useRef<WorkspaceUpdate>();
  persistRef.current = persist;

  useEffect(() => {
    if (activePersistRef.current || pendingPersistRef.current) return;
    if (!remoteState || timestamp(remoteState) < timestamp(stateRef.current)) return;
    stateRef.current = remoteState;
    setState(remoteState);
  }, [remoteState]);

  const drainPersistence = () => {
    if (activePersistRef.current) return;
    activePersistRef.current = true;
    void (async () => {
      while (pendingPersistRef.current) {
        const next = pendingPersistRef.current;
        pendingPersistRef.current = undefined;
        await settlePersistence(persistRef.current, next);
      }
      activePersistRef.current = false;
    })();
  };

  const update = (next: WorkspaceUpdate) => {
    const optimistic = { ...next, updatedAt: new Date().toISOString() };
    stateRef.current = optimistic;
    setState(optimistic);
    pendingPersistRef.current = next;
    drainPersistence();
  };

  return [state, update];
}
