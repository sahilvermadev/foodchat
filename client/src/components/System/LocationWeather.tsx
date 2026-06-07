import { useEffect, useState } from 'react';
import { usePreferencesQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

type WeatherDisplay = {
  town: string;
  temperature?: number;
  unit: 'C' | 'F';
  code?: number;
  updatedAt: number;
  sourceKey: string;
};

type CachedWeather = WeatherDisplay & {
  expiresAt: number;
};

type ReverseGeocodeResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    latitude?: number;
    longitude?: number;
  }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
};

type LocationTarget =
  | {
      sourceKey: string;
      townHint?: string;
      latitude: number;
      longitude: number;
    }
  | {
      sourceKey: string;
      townHint: string;
      query: string;
    };

const cacheKeyPrefix = 'rekky:location-weather:v2';
const cacheTtlMs = 30 * 60 * 1000;
const geolocationTimeoutMs = 5000;

function cacheKey(userId: string, sourceKey: string): string {
  return `${cacheKeyPrefix}:${encodeURIComponent(userId)}:${encodeURIComponent(sourceKey)}`;
}

function readCache(userId: string, sourceKey: string): CachedWeather | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(cacheKey(userId, sourceKey)) ?? 'null',
    ) as CachedWeather | null;
    if (!parsed || parsed.expiresAt <= Date.now()) {
      return null;
    }
    return parsed.sourceKey === sourceKey ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, display: WeatherDisplay) {
  if (typeof display.temperature !== 'number' || typeof display.code !== 'number') {
    return;
  }
  try {
    localStorage.setItem(
      cacheKey(userId, display.sourceKey),
      JSON.stringify({
        ...display,
        expiresAt: Date.now() + cacheTtlMs,
      }),
    );
  } catch {
    // Ignore storage failures; the widget is optional.
  }
}

function temperatureUnit(): 'celsius' | 'fahrenheit' {
  const region = (navigator.language || 'en').split('-')[1]?.toUpperCase();
  return region === 'US' || region === 'BS' || region === 'LR' ? 'fahrenheit' : 'celsius';
}

function unitLabel(unit: 'celsius' | 'fahrenheit'): 'C' | 'F' {
  return unit === 'fahrenheit' ? 'F' : 'C';
}

type WeatherLabelKey =
  | 'com_weather_clear'
  | 'com_weather_cloudy'
  | 'com_weather_fog'
  | 'com_weather_rain'
  | 'com_weather_snow'
  | 'com_weather_storm'
  | 'com_weather_generic';

function weatherLabelKey(code: number): WeatherLabelKey {
  if (code === 0) {
    return 'com_weather_clear';
  }
  if ([1, 2, 3].includes(code)) {
    return 'com_weather_cloudy';
  }
  if ([45, 48].includes(code)) {
    return 'com_weather_fog';
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return 'com_weather_rain';
  }
  if (code >= 71 && code <= 77) {
    return 'com_weather_snow';
  }
  if (code >= 95) {
    return 'com_weather_storm';
  }
  return 'com_weather_generic';
}

function locationLines(markdown = ''): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const headingIndex = lines.findIndex((line) => /^##\s+Location\s*$/i.test(line.trim()));
  if (headingIndex < 0) {
    return [];
  }
  const nextHeadingIndex = lines.findIndex(
    (line, index) => index > headingIndex && /^##\s+/.test(line.trim()),
  );
  return lines
    .slice(headingIndex + 1, nextHeadingIndex > headingIndex ? nextHeadingIndex : undefined)
    .map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean);
}

function cleanLocation(value: string): string {
  return value
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^location:\s*/i, '')
    .trim();
}

function townFromLocation(value: string): string {
  return cleanLocation(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0];
}

function targetFromPreferences(markdown?: string): LocationTarget | null {
  const lines = locationLines(markdown);
  const locationLine = lines.find((line) => /^location:\s*/i.test(line)) ?? lines[0];
  if (!locationLine) {
    return null;
  }

  const location = cleanLocation(locationLine);
  const coordinateMatch = location.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]);
    const longitude = Number(coordinateMatch[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        sourceKey: `coords:${latitude.toFixed(3)},${longitude.toFixed(3)}`,
        latitude,
        longitude,
      };
    }
  }

  const townHint = townFromLocation(location);
  return townHint
    ? { sourceKey: `query:${location.toLowerCase()}`, query: location, townHint }
    : null;
}

function getPosition(signal: AbortSignal): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }

    const abort = () => resolve(null);
    signal.addEventListener('abort', abort, { once: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        signal.removeEventListener('abort', abort);
        resolve(position);
      },
      () => {
        signal.removeEventListener('abort', abort);
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        maximumAge: cacheTtlMs,
        timeout: geolocationTimeoutMs,
      },
    );
  });
}

async function targetFromBrowser(signal: AbortSignal): Promise<LocationTarget | null> {
  const position = await getPosition(signal);
  if (!position || signal.aborted) {
    return null;
  }

  return {
    sourceKey: `browser:${position.coords.latitude.toFixed(3)},${position.coords.longitude.toFixed(3)}`,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function resolveTarget(target: LocationTarget, signal: AbortSignal) {
  if ('latitude' in target) {
    return target;
  }

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(target.query)}&count=1&language=en&format=json`,
    { signal },
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as ReverseGeocodeResponse;
  const result = body.results?.[0];
  if (typeof result?.latitude !== 'number' || typeof result?.longitude !== 'number') {
    return null;
  }

  return {
    ...target,
    townHint: target.townHint || result.name,
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

async function fetchLocationWeather(
  target: LocationTarget,
  signal: AbortSignal,
): Promise<WeatherDisplay | null> {
  const resolvedTarget = await resolveTarget(target, signal);
  if (!resolvedTarget || signal.aborted) {
    return null;
  }

  const latitude = resolvedTarget.latitude.toFixed(4);
  const longitude = resolvedTarget.longitude.toFixed(4);
  const unit = temperatureUnit();

  const [geocodeResponse, forecastResponse] = await Promise.all([
    fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`,
      { signal },
    ),
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=${unit}&timezone=auto`,
      { signal },
    ),
  ]);

  if (!geocodeResponse.ok || !forecastResponse.ok) {
    return null;
  }

  const [geocode, forecast] = (await Promise.all([
    geocodeResponse.json(),
    forecastResponse.json(),
  ])) as [ReverseGeocodeResponse, ForecastResponse];

  const town =
    resolvedTarget.townHint?.trim() ||
    geocode.results?.[0]?.name?.trim() ||
    geocode.results?.[0]?.admin1?.trim();
  const temperature = forecast.current?.temperature_2m;
  const code = forecast.current?.weather_code;

  if (!town || typeof temperature !== 'number' || typeof code !== 'number') {
    return null;
  }

  return {
    town,
    temperature: Math.round(temperature),
    unit: unitLabel(unit),
    code,
    updatedAt: Date.now(),
    sourceKey: target.sourceKey,
  };
}

export default function LocationWeather() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [display, setDisplay] = useState<WeatherDisplay | null>(null);
  const { data: preferences } = usePreferencesQuery({
    staleTime: cacheTtlMs,
    cacheTime: cacheTtlMs,
  });

  useEffect(() => {
    if (!user?.id) {
      setDisplay(null);
      return undefined;
    }
    const userId = user.id;

    const preferenceTarget = targetFromPreferences(preferences?.markdown);
    const cached = preferenceTarget ? readCache(userId, preferenceTarget.sourceKey) : null;
    if (cached) {
      setDisplay(cached);
      return undefined;
    }

    setDisplay(null);
    if (preferenceTarget && 'townHint' in preferenceTarget && preferenceTarget.townHint) {
      setDisplay({
        town: preferenceTarget.townHint,
        unit: unitLabel(temperatureUnit()),
        updatedAt: Date.now(),
        sourceKey: preferenceTarget.sourceKey,
      });
    }

    const controller = new AbortController();

    async function load() {
      const target = preferenceTarget ?? (await targetFromBrowser(controller.signal));
      if (!target) {
        return null;
      }
      const targetCache = readCache(userId, target.sourceKey);
      return targetCache ?? fetchLocationWeather(target, controller.signal);
    }

    load()
      .then((next) => {
        if (!next || controller.signal.aborted) {
          return;
        }
        writeCache(userId, next);
        setDisplay(next);
      })
      .catch(() => {
        // The weather badge should never surface permission or network failures.
      });

    return () => controller.abort();
  }, [preferences?.markdown, user?.id]);

  if (!display) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-8 top-[calc(env(safe-area-inset-top)+1.35rem)] z-30 hidden max-w-[16rem] items-center justify-end gap-1.5 text-right text-[12px] leading-none text-gray-300/80 md:flex xl:right-12">
      <span className="truncate">{display.town}</span>
      {typeof display.temperature === 'number' ? (
        <>
          <span className="text-gray-500/70">/</span>
          <span className="whitespace-nowrap text-gray-100/90">
            {display.temperature}°{display.unit}
          </span>
        </>
      ) : null}
      {typeof display.code === 'number' ? (
        <span className="hidden whitespace-nowrap text-gray-400/70 md:inline">
          {localize(weatherLabelKey(display.code))}
        </span>
      ) : null}
    </div>
  );
}
