import { useAtom } from 'jotai';
import type { Favorite } from '~/store/favorites';
import { favoritesAtom } from '~/store';

const cleanFavorites = (favorites: Favorite[]): Favorite[] =>
  favorites.filter((favorite) => favorite.agentId || favorite.spec || (favorite.model && favorite.endpoint));

export default function useFavorites() {
  const [favorites, setFavorites] = useAtom(favoritesAtom);

  const saveFavorites = (next: Favorite[]) => setFavorites(cleanFavorites(next));
  const isFavoriteAgent = (agentId?: string | null) =>
    !!agentId && favorites.some((favorite) => favorite.agentId === agentId);
  const isFavoriteModel = (model: string, endpoint: string) =>
    favorites.some((favorite) => favorite.model === model && favorite.endpoint === endpoint);
  const isFavoriteSpec = (spec?: string | null) =>
    !!spec && favorites.some((favorite) => favorite.spec === spec);

  const addFavoriteAgent = (agentId: string) => saveFavorites([...favorites, { agentId }]);
  const removeFavoriteAgent = (agentId: string) =>
    saveFavorites(favorites.filter((favorite) => favorite.agentId !== agentId));
  const addFavoriteModel = (model: { model: string; endpoint: string }) =>
    saveFavorites([...favorites, { model: model.model, endpoint: model.endpoint }]);
  const removeFavoriteModel = (model: string, endpoint: string) =>
    saveFavorites(favorites.filter((favorite) => favorite.model !== model || favorite.endpoint !== endpoint));
  const addFavoriteSpec = (spec: string) => saveFavorites([...favorites, { spec }]);
  const removeFavoriteSpec = (spec: string) =>
    saveFavorites(favorites.filter((favorite) => favorite.spec !== spec));

  return {
    favorites,
    addFavoriteAgent,
    removeFavoriteAgent,
    addFavoriteModel,
    removeFavoriteModel,
    addFavoriteSpec,
    removeFavoriteSpec,
    isFavoriteAgent,
    isFavoriteModel,
    isFavoriteSpec,
    toggleFavoriteAgent: (agentId: string) =>
      isFavoriteAgent(agentId) ? removeFavoriteAgent(agentId) : addFavoriteAgent(agentId),
    toggleFavoriteModel: (model: { model: string; endpoint: string }) =>
      isFavoriteModel(model.model, model.endpoint) ? removeFavoriteModel(model.model, model.endpoint) : addFavoriteModel(model),
    toggleFavoriteSpec: (spec: string) =>
      isFavoriteSpec(spec) ? removeFavoriteSpec(spec) : addFavoriteSpec(spec),
    reorderFavorites: (next: Favorite[], _persist = false) => saveFavorites(next),
    isLoading: false,
    isError: false,
    isUpdating: false,
    fetchError: null,
    updateError: null,
  };
}
