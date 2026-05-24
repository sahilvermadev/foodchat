import { IThemeRGB } from '../types';

/**
 * Default light theme
 * RGB values extracted from the existing CSS variables
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '26 25 23', // #1A1917
  'rgb-text-secondary': '74 72 68', // #4A4844
  'rgb-text-secondary-alt': '74 72 68', // #4A4844
  'rgb-text-tertiary': '111 107 100', // #6F6B64
  'rgb-text-warning': '138 90 0', // #8a5a00

  // Ring colors
  'rgb-ring-primary': '200 90 50', // #C85A32

  // Header colors
  'rgb-header-primary': '250 250 247', // #FAFAF7
  'rgb-header-hover': '244 235 225', // #F4EBE1
  'rgb-header-button-hover': '244 235 225', // #F4EBE1

  // Surface colors
  'rgb-surface-active': '244 235 225', // #F4EBE1
  'rgb-surface-active-alt': '244 235 225', // #F4EBE1
  'rgb-surface-hover': '244 235 225', // #F4EBE1
  'rgb-surface-hover-alt': '239 227 214', // #EFE3D6
  'rgb-surface-primary': '250 250 247', // #FAFAF7
  'rgb-surface-primary-alt': '243 241 235', // #F3F1EB
  'rgb-surface-primary-contrast': '244 235 225', // #F4EBE1
  'rgb-surface-secondary': '244 235 225', // #F4EBE1
  'rgb-surface-secondary-alt': '244 235 225', // #F4EBE1
  'rgb-surface-tertiary': '230 227 218', // #E6E3DA
  'rgb-surface-tertiary-alt': '250 250 247', // #FAFAF7
  'rgb-surface-dialog': '250 250 247', // #FAFAF7
  'rgb-surface-submit': '200 90 50', // #C85A32
  'rgb-surface-submit-hover': '178 78 42', // #B24E2A
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '243 241 235', // #F3F1EB

  // Border colors
  'rgb-border-light': '230 227 218', // #E6E3DA
  'rgb-border-medium': '216 210 196', // #D8D2C4
  'rgb-border-medium-alt': '216 210 196', // #D8D2C4
  'rgb-border-heavy': '185 177 162', // #B9B1A2
  'rgb-border-xheavy': '74 72 68', // #4A4844

  // Brand colors
  'rgb-brand-purple': '109 58 109', // #6d3a6d

  // Presentation
  'rgb-presentation': '243 241 235', // #F3F1EB

  // Utility colors (mapped to existing colors for backwards compatibility)
  'rgb-background': '243 241 235', // Same as surface-primary-alt
  'rgb-foreground': '26 25 23', // Same as text-primary
  'rgb-primary': '200 90 50', // Same as surface-submit
  'rgb-primary-foreground': '255 255 255', // White on terracotta
  'rgb-secondary': '244 235 225', // Same as surface-secondary
  'rgb-secondary-foreground': '26 25 23', // Same as text-primary
  'rgb-muted': '243 241 235', // Same as surface-primary-alt
  'rgb-muted-foreground': '74 72 68', // Same as text-secondary
  'rgb-accent': '244 235 225', // Same as surface-hover
  'rgb-accent-foreground': '26 25 23', // Same as text-primary
  'rgb-destructive-foreground': '255 255 255', // White on destructive red
  'rgb-border': '230 227 218', // Same as border-light
  'rgb-input': '230 227 218', // Same as border-light
  'rgb-ring': '200 90 50', // Same as ring-primary
  'rgb-card': '250 250 247', // Same as surface-primary
  'rgb-card-foreground': '26 25 23', // Same as text-primary
};
