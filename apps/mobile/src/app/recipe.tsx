import { router, useLocalSearchParams } from 'expo-router';

import { RecipeDetailScreen } from '@/features/recipes/detail';

const param = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function RecipeScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    source?: string | string[];
  }>();
  const recipeId = param(params.id) ?? '';
  const source = param(params.source) === 'public' ? 'public' : 'private';
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/home');
  };

  return <RecipeDetailScreen onBack={goBack} recipeId={recipeId} source={source} />;
}
