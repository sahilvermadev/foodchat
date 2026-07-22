import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';

import { fonts, radius, space } from '@/constants/theme';
import { useConnectivity } from '@/features/connectivity/provider';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

export function OfflineStatus() {
  const { isOnline } = useConnectivity();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useStyles();
  if (isOnline) return null;
  return (
    <View accessibilityRole="text" style={styles.container}>
      <SymbolView
        name={{ android: 'cloud_off', ios: 'icloud.slash' }}
        size={15}
        tintColor={colors.inkMuted}
      />
      <Text style={styles.text}>{t('offline.savedOnDevice')}</Text>
    </View>
  );
}

const useStyles = createThemeStyles((palette) => ({
  container: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  text: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
}));
