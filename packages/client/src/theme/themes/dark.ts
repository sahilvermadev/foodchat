import { IThemeRGB } from '../types';

/**
 * Dark theme
 * RGB values extracted from the existing dark mode CSS variables
 */
export const darkTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '255 255 255', // #ffffff
  'rgb-text-secondary': '216 208 200', // #d8d0c8
  'rgb-text-secondary-alt': '175 165 157', // #afa59d
  'rgb-text-tertiary': '175 165 157', // #afa59d
  'rgb-text-warning': '242 201 76', // #f2c94c

  // Ring colors (not defined in dark mode, using default)
  'rgb-ring-primary': '240 90 61', // #f05a3d

  // Header colors
  'rgb-header-primary': '34 29 32', // #221d20
  'rgb-header-hover': '42 34 36', // #2a2224
  'rgb-header-button-hover': '42 34 36', // #2a2224

  // Surface colors
  'rgb-surface-active': '58 48 52', // #3a3034
  'rgb-surface-active-alt': '42 34 36', // #2a2224
  'rgb-surface-hover': '52 39 44', // #34272c
  'rgb-surface-hover-alt': '58 48 52', // #3a3034
  'rgb-surface-primary': '34 29 32', // #221d20
  'rgb-surface-primary-alt': '23 18 23', // #171217
  'rgb-surface-primary-contrast': '27 21 27', // #1b151b
  'rgb-surface-secondary': '42 34 36', // #2a2224
  'rgb-surface-secondary-alt': '52 39 44', // #34272c
  'rgb-surface-tertiary': '58 48 52', // #3a3034
  'rgb-surface-tertiary-alt': '74 59 64', // #4a3b40
  'rgb-surface-dialog': '34 29 32', // #221d20
  'rgb-surface-submit': '240 90 61', // #f05a3d
  'rgb-surface-submit-hover': '255 104 77', // #ff684d
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '34 29 32', // #221d20

  // Border colors
  'rgb-border-light': '58 48 52', // #3a3034
  'rgb-border-medium': '74 59 64', // #4a3b40
  'rgb-border-medium-alt': '74 59 64', // #4a3b40
  'rgb-border-heavy': '107 90 96', // #6b5a60
  'rgb-border-xheavy': '175 165 157', // #afa59d

  // Brand colors
  'rgb-brand-purple': '109 58 109', // #6d3a6d

  // Presentation
  'rgb-presentation': '23 18 23', // #171217

  // Utility colors (mapped to existing colors for backwards compatibility)
  'rgb-background': '23 18 23', // Same as surface-primary-alt
  'rgb-foreground': '255 255 255', // Same as text-primary
  'rgb-primary': '240 90 61', // Same as surface-submit
  'rgb-primary-foreground': '0 0 0', // Black on tomato
  'rgb-secondary': '42 34 36', // Same as surface-secondary
  'rgb-secondary-foreground': '216 208 200', // Same as text-secondary
  'rgb-muted': '42 34 36', // Same as surface-secondary
  'rgb-muted-foreground': '216 208 200', // Same as text-secondary
  'rgb-accent': '52 39 44', // Same as surface-hover
  'rgb-accent-foreground': '255 255 255', // Same as text-primary
  'rgb-destructive-foreground': '255 255 255', // Same as text-primary
  'rgb-border': '58 48 52', // Same as border-light
  'rgb-input': '58 48 52', // Same as border-light
  'rgb-ring': '240 90 61', // Same as ring-primary
  'rgb-card': '34 29 32', // Same as surface-primary
  'rgb-card-foreground': '255 255 255', // Same as text-primary
};
