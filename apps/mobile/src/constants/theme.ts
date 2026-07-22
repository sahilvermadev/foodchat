import { Platform } from 'react-native';

export const palette = {
  canvas: '#F3F1EB',
  canvasRaised: '#FAFAF7',
  ink: '#1A1917',
  inkMuted: '#4A4844',
  line: '#E6E3DA',
  ember: '#C85A32',
  emberDark: '#B24E2A',
  herb: '#4F8A48',
  herbSoft: '#E8F2E5',
  saffron: '#F2C94C',
  plum: '#6D3A6D',
  softClay: '#F4EBE1',
  danger: '#8A2F22',
  dangerSoft: '#FBE8E2',
  white: '#FFFFFF',
  black: '#171217',
} as const;

export const darkPalette = {
  ...palette,
  canvas: '#171217',
  canvasRaised: '#221D20',
  ink: '#FFFFFF',
  inkMuted: '#D8D0C8',
  line: '#3A3034',
  ember: '#E06B43',
  emberDark: '#F0805A',
  herb: '#63A85B',
  herbSoft: '#293329',
  softClay: '#332523',
  danger: '#FF9A89',
  dangerSoft: '#3D2423',
} as const;

export type ThemePalette = { [Key in keyof typeof palette]: string };

export const fonts = {
  brand: 'Syne_800ExtraBold',
  sans: 'SpaceGrotesk_400Regular',
  sansMedium: 'SpaceGrotesk_500Medium',
  sansSemibold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  serif: 'SpaceGrotesk_600SemiBold',
  rounded: 'SpaceGrotesk_700Bold',
  recipeHeading: 'Lora_700Bold',
  recipeBody: 'Merriweather_400Regular',
  recipeBodyBold: 'Merriweather_700Bold',
  mono: 'JetBrainsMono_700Bold',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const shadow = Platform.select({
  ios: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  android: { elevation: 3 },
  default: {},
});
