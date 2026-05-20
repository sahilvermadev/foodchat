import { IThemeRGB } from '../types';

/**
 * Default light theme
 * RGB values extracted from the existing CSS variables
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '29 26 22', // #1d1a16
  'rgb-text-secondary': '95 85 77', // #5f554d
  'rgb-text-secondary-alt': '95 85 77', // #5f554d
  'rgb-text-tertiary': '122 111 102', // #7a6f66
  'rgb-text-warning': '138 90 0', // #8a5a00

  // Ring colors
  'rgb-ring-primary': '240 90 61', // #f05a3d

  // Header colors
  'rgb-header-primary': '255 253 248', // #fffdf8
  'rgb-header-hover': '246 239 228', // #f6efe4
  'rgb-header-button-hover': '246 239 228', // #f6efe4

  // Surface colors
  'rgb-surface-active': '234 223 206', // #eadfce
  'rgb-surface-active-alt': '226 210 189', // #e2d2bd
  'rgb-surface-hover': '234 223 206', // #eadfce
  'rgb-surface-hover-alt': '220 203 182', // #dccbb6
  'rgb-surface-primary': '255 253 248', // #fffdf8
  'rgb-surface-primary-alt': '255 248 239', // #fff8ef
  'rgb-surface-primary-contrast': '246 239 228', // #f6efe4
  'rgb-surface-secondary': '246 239 228', // #f6efe4
  'rgb-surface-secondary-alt': '234 223 206', // #eadfce
  'rgb-surface-tertiary': '238 227 211', // #eee3d3
  'rgb-surface-tertiary-alt': '255 253 248', // #fffdf8
  'rgb-surface-dialog': '255 253 248', // #fffdf8
  'rgb-surface-submit': '240 90 61', // #f05a3d
  'rgb-surface-submit-hover': '220 69 47', // #dc452f
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '255 253 248', // #fffdf8

  // Border colors
  'rgb-border-light': '223 208 191', // #dfd0bf
  'rgb-border-medium': '210 192 173', // #d2c0ad
  'rgb-border-medium-alt': '210 192 173', // #d2c0ad
  'rgb-border-heavy': '169 149 130', // #a99582
  'rgb-border-xheavy': '119 104 92', // #77685c

  // Brand colors
  'rgb-brand-purple': '109 58 109', // #6d3a6d

  // Presentation
  'rgb-presentation': '255 248 239', // #fff8ef

  // Utility colors (mapped to existing colors for backwards compatibility)
  'rgb-background': '255 248 239', // Same as surface-primary-alt
  'rgb-foreground': '29 26 22', // Same as text-primary
  'rgb-primary': '240 90 61', // Same as surface-submit
  'rgb-primary-foreground': '0 0 0', // Black on tomato
  'rgb-secondary': '246 239 228', // Same as surface-secondary
  'rgb-secondary-foreground': '29 26 22', // Same as text-primary
  'rgb-muted': '246 239 228', // Same as surface-secondary
  'rgb-muted-foreground': '95 85 77', // Same as text-secondary
  'rgb-accent': '234 223 206', // Same as surface-hover
  'rgb-accent-foreground': '29 26 22', // Same as text-primary
  'rgb-destructive-foreground': '255 255 255', // White on destructive red
  'rgb-border': '223 208 191', // Same as border-light
  'rgb-input': '223 208 191', // Same as border-light
  'rgb-ring': '240 90 61', // Same as ring-primary
  'rgb-card': '255 253 248', // Same as surface-primary
  'rgb-card-foreground': '29 26 22', // Same as text-primary
};
