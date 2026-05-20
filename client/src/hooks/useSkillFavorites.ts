import { useCallback, useMemo, useState } from 'react';

export default function useSkillFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const isFavorite = useCallback(
    (skillId: string | undefined | null) => !!skillId && favoriteSet.has(skillId),
    [favoriteSet],
  );
  const add = useCallback(
    (skillId: string) => setFavorites((current) => Array.from(new Set([...current, skillId]))),
    [],
  );
  const remove = useCallback(
    (skillId: string) => setFavorites((current) => current.filter((id) => id !== skillId)),
    [],
  );
  const toggle = useCallback(
    (skillId: string) => (favoriteSet.has(skillId) ? remove(skillId) : add(skillId)),
    [add, favoriteSet, remove],
  );

  return {
    favorites,
    isFavorite,
    add,
    remove,
    toggle,
    isLoading: false,
    isError: false,
    isUpdating: false,
  };
}
