import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Syne_800ExtraBold } from '@expo-google-fonts/syne';
import { Lora_700Bold } from '@expo-google-fonts/lora';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { Merriweather_400Regular, Merriweather_700Bold } from '@expo-google-fonts/merriweather';

import { fonts, space } from '@/constants/theme';
import { useAuth } from '@/features/auth/provider';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { AppProvider } from '@/providers/app-provider';

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { status } = useAuth();
  const { colors, mode, ready } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'restoring' || !ready) return;
    void SplashScreen.hideAsync();
    if (
      status === 'signedIn' &&
      ['/', '/sign-in', '/register', '/two-factor', '/check-email', '/forgot-password'].includes(
        pathname,
      )
    ) {
      router.replace('/home');
    }
    if (status === 'twoFactor' && pathname !== '/two-factor') router.replace('/two-factor');
    if (
      status === 'signedOut' &&
      !['/sign-in', '/register', '/check-email', '/forgot-password'].includes(pathname)
    ) {
      router.replace('/sign-in');
    }
  }, [pathname, ready, router, status]);

  if (status === 'restoring' || !ready) {
    return (
      <View style={styles.loading}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.ember} size="large" />
        <Text style={styles.loadingText}>{t('auth.loading')}</Text>
      </View>
    );
  }

  if (status === 'signedIn') {
    return (
      <>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            fullScreenGestureEnabled: true,
            gestureEnabled: true,
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          <Stack.Screen name="cook" />
          <Stack.Screen name="recipe" />
          <Stack.Screen name="preferences" />
          <Stack.Screen name="settings" />
        </Stack>
      </>
    );
  }

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ animation: 'fade', headerShown: false }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
        <Stack.Screen name="two-factor" />
        <Stack.Screen name="check-email" />
        <Stack.Screen name="forgot-password" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_700Bold,
    Lora_700Bold,
    Merriweather_400Regular,
    Merriweather_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Syne_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppProvider>
      <Navigation />
    </AppProvider>
  );
}

const useStyles = createThemeStyles((palette) => ({
  loading: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    flex: 1,
    gap: space.lg,
    justifyContent: 'center',
  },
  loadingText: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 15 },
}));
