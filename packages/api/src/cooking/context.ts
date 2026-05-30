export type MealOccasion = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late_night' | 'unknown';

export type TurnContextConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type TurnContext = {
  normalizedLocalTimestamp?: string;
  timeZoneSource: 'input' | 'saved_preferences' | 'unavailable';
  coarseLocaleCountry?: string;
  localeSource: 'input' | 'saved_preferences' | 'unavailable';
  likelyMealOccasion: MealOccasion;
  confidence: TurnContextConfidence;
};

export type TurnContextInput = {
  conversationCreatedAt?: string | number | Date;
  locale?: string;
  timeZone?: string;
  preferencesMarkdown?: string;
};

type LocalTimestampParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function validDate(value: string | number | Date | undefined): Date | undefined {
  if (value == null) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function validTimeZone(value: string | undefined): string | undefined {
  const timeZone = value?.trim();
  if (!timeZone) {
    return undefined;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'));
    return timeZone;
  } catch {
    return undefined;
  }
}

function savedTimeZone(markdown: string | undefined): string | undefined {
  const match = markdown?.match(
    /\b(?:time\s*zone|timezone)\s*[:=-]?\s*([A-Za-z_]+\/[A-Za-z0-9_+\-/]+)\b/i,
  );
  return validTimeZone(match?.[1]);
}

function localeCountry(locale: string | undefined): string | undefined {
  const clean = locale?.trim();
  if (!clean) {
    return undefined;
  }

  try {
    const region = new Intl.Locale(clean).region;
    if (!region) {
      return undefined;
    }
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
  } catch {
    return undefined;
  }
}

function savedLocationBody(markdown: string | undefined): string | undefined {
  if (!markdown) {
    return undefined;
  }

  const match = markdown.match(/(?:^|\n)##\s+Location\s*\n([\s\S]*?)(?=\n##\s+|\s*$)/i);
  return match?.[1];
}

function savedCountry(markdown: string | undefined): string | undefined {
  const locationBody = savedLocationBody(markdown);
  if (!locationBody) {
    return undefined;
  }

  if (
    /\bindia\b|\bdelhi\b|\bdwarka\b|\bmumbai\b|\bbengaluru\b|\bbangalore\b|\bkolkata\b|\bchennai\b|\bhyderabad\b/i.test(
      locationBody,
    )
  ) {
    return 'India';
  }
  if (/\bunited states\b|\busa\b|\bu\.s\.\b|\bnew york\b|\bcalifornia\b/i.test(locationBody)) {
    return 'United States';
  }
  if (/\bunited kingdom\b|\buk\b|\blondon\b/i.test(locationBody)) {
    return 'United Kingdom';
  }
  return undefined;
}

function localTimestampParts(date: Date, timeZone: string): LocalTimestampParts | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    return parts.reduce<LocalTimestampParts>(
      (acc, part) => {
        if (
          part.type === 'year' ||
          part.type === 'month' ||
          part.type === 'day' ||
          part.type === 'hour' ||
          part.type === 'minute' ||
          part.type === 'second'
        ) {
          return { ...acc, [part.type]: part.value };
        }
        return acc;
      },
      { year: '', month: '', day: '', hour: '', minute: '', second: '' },
    );
  } catch {
    return undefined;
  }
}

function mealOccasion(hour: number): MealOccasion {
  if (hour >= 5 && hour < 11) {
    return 'breakfast';
  }
  if (hour >= 11 && hour < 15) {
    return 'lunch';
  }
  if (hour >= 15 && hour < 18) {
    return 'snack';
  }
  if (hour >= 18 && hour < 22) {
    return 'dinner';
  }
  return 'late_night';
}

export function buildTurnContext(input: TurnContextInput): TurnContext {
  const date = validDate(input.conversationCreatedAt);
  const directTimeZone = validTimeZone(input.timeZone);
  const preferenceTimeZone = directTimeZone ? undefined : savedTimeZone(input.preferencesMarkdown);
  const timeZone = directTimeZone ?? preferenceTimeZone;
  let timeZoneSource: TurnContext['timeZoneSource'] = 'unavailable';
  if (directTimeZone) {
    timeZoneSource = 'input';
  } else if (preferenceTimeZone) {
    timeZoneSource = 'saved_preferences';
  }

  const directCountry = localeCountry(input.locale);
  const preferenceCountry = directCountry ? undefined : savedCountry(input.preferencesMarkdown);
  let localeSource: TurnContext['localeSource'] = 'unavailable';
  if (directCountry) {
    localeSource = 'input';
  } else if (preferenceCountry) {
    localeSource = 'saved_preferences';
  }

  if (!date || !timeZone) {
    return {
      timeZoneSource,
      coarseLocaleCountry: directCountry ?? preferenceCountry,
      localeSource,
      likelyMealOccasion: 'unknown',
      confidence: 'unknown',
    };
  }

  const parts = localTimestampParts(date, timeZone);
  const hour = Number(parts?.hour);
  if (!parts || !Number.isFinite(hour)) {
    return {
      timeZoneSource,
      coarseLocaleCountry: directCountry ?? preferenceCountry,
      localeSource,
      likelyMealOccasion: 'unknown',
      confidence: 'unknown',
    };
  }

  return {
    normalizedLocalTimestamp: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    timeZoneSource,
    coarseLocaleCountry: directCountry ?? preferenceCountry,
    localeSource,
    likelyMealOccasion: mealOccasion(hour === 24 ? 0 : hour),
    confidence: timeZoneSource === 'input' ? 'medium' : 'low',
  };
}
