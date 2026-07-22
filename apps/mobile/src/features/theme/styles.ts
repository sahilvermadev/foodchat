import { StyleSheet } from 'react-native';

import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';
import type { ThemePalette } from '@/constants/theme';

import { useTheme } from './provider';

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function createThemeStyles<Styles extends NamedStyles>(
  factory: (colors: ThemePalette) => Styles,
) {
  const cache = new WeakMap<ThemePalette, Styles>();

  return function useStyles() {
    const { colors } = useTheme();
    const cached = cache.get(colors);
    if (cached) return cached;
    const styles = StyleSheet.create(factory(colors));
    cache.set(colors, styles);
    return styles;
  };
}
