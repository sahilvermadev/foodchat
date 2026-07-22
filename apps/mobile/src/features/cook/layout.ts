export type CookHomeFrame = {
  fontScale: number;
  height: number;
  width: number;
};

export type CookHomeLayout = {
  allowVerticalScroll: boolean;
  compact: boolean;
};

export function cookHomeLayout({ fontScale, height, width }: CookHomeFrame): CookHomeLayout {
  return {
    allowVerticalScroll: fontScale > 1.3,
    compact: height < 700 || width < 350,
  };
}

export function exploreCardWidth(width: number, compact: boolean): number {
  const desiredWidth = Math.round(width * 0.72);
  if (compact) return Math.min(244, Math.max(208, desiredWidth));
  return Math.min(300, Math.max(232, desiredWidth));
}
