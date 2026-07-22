import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';

import type { PropsWithChildren } from 'react';
import type { ThemePalette } from '@/constants/theme';

import { darkPalette, palette } from '@/constants/theme';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  colors: ThemePalette;
  mode: ThemeMode;
  ready: boolean;
  setMode: (mode: ThemeMode) => void;
}

const storageKey = 'rekky.mobile.theme.v1';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(storageKey)
      .then((storedMode) => {
        if (storedMode === 'dark' || storedMode === 'light') setModeState(storedMode);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const colors = mode === 'dark' ? darkPalette : palette;

  useEffect(() => {
    Appearance.setColorScheme(mode);
    void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
  }, [colors.canvas, mode]);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    void AsyncStorage.setItem(storageKey, nextMode).catch(() => undefined);
  };
  const value = useMemo(() => ({ colors, mode, ready, setMode }), [colors, mode, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
