import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ColorValue } from 'react-native';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { HistoryDrawer } from '@/features/cook/history';
import type { HistoryActions } from '@/features/navigation/shell';
import { AppShellProvider, registerOpenHistory } from '@/features/navigation/shell';
import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

function TabIcon({
  android,
  ios,
  color,
  focused,
}: {
  android: AndroidSymbol;
  ios: SFSymbol;
  color: ColorValue;
  focused: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <SymbolView
        animationSpec={focused ? { effect: { type: 'bounce', wholeSymbol: true } } : undefined}
        name={{ android, ios }}
        size={focused ? 22 : 21}
        tintColor={color}
        weight={focused ? 'semibold' : 'regular'}
      />
    </View>
  );
}

export function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyActions, setHistoryActions] = useState<HistoryActions>();
  const openHistory = useCallback((actions: HistoryActions) => {
    setHistoryActions(actions);
    setHistoryOpen(true);
  }, []);
  const shell = useMemo(() => ({ openHistory }), [openHistory]);

  useEffect(() => {
    return registerOpenHistory(openHistory);
  }, [openHistory]);

  return (
    <AppShellProvider value={shell}>
      <Drawer
        drawerStyle={styles.drawer}
        drawerType="front"
        onClose={() => setHistoryOpen(false)}
        onOpen={() => setHistoryOpen(true)}
        open={historyOpen}
        overlayAccessibilityLabel={t('cook.closeHistory')}
        overlayStyle={styles.overlay}
        renderDrawerContent={() =>
          historyActions ? (
            <HistoryDrawer
              activeConversationId={historyActions.activeConversationId}
              onClose={() => setHistoryOpen(false)}
              onNewChat={historyActions.onNewChat}
              onSelect={historyActions.onSelect}
            />
          ) : (
            <View style={styles.drawer} />
          )
        }
      >
        <Tabs
          backBehavior="history"
          screenListeners={{
            tabPress: () => {
              void Haptics.selectionAsync();
            },
          }}
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.ember,
            tabBarHideOnKeyboard: Platform.OS === 'ios',
            tabBarInactiveTintColor: colors.inkMuted,
            tabBarItemStyle: styles.tabItem,
            tabBarLabelStyle: styles.tabLabel,
            tabBarStyle: [
              styles.tabBar,
              {
                height: 68 + insets.bottom,
                paddingBottom: Math.max(insets.bottom, space.sm),
              },
            ],
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t('tabs.cook'),
              tabBarIcon: ({ color, focused }) => (
                <TabIcon android="chef_hat" color={color} focused={focused} ios="frying.pan" />
              ),
            }}
          />
          <Tabs.Screen
            name="cookbook"
            options={{
              title: t('tabs.library'),
              tabBarIcon: ({ color, focused }) => (
                <TabIcon
                  android="book_2"
                  color={color}
                  focused={focused}
                  ios={focused ? 'book.closed.fill' : 'book.closed'}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="shopping"
            options={{
              title: t('tabs.shopping'),
              tabBarIcon: ({ color, focused }) => (
                <TabIcon
                  android="shopping_basket"
                  color={color}
                  focused={focused}
                  ios={focused ? 'basket.fill' : 'basket'}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="sources"
            options={{
              title: t('tabs.imports'),
              tabBarIcon: ({ color, focused }) => (
                <TabIcon
                  android="download_2"
                  color={color}
                  focused={focused}
                  ios={focused ? 'square.and.arrow.down.fill' : 'square.and.arrow.down'}
                />
              ),
            }}
          />
        </Tabs>
      </Drawer>
    </AppShellProvider>
  );
}

const useStyles = createThemeStyles((palette) => ({
  drawer: { backgroundColor: palette.canvas, maxWidth: 370, width: '86%' },
  overlay: { backgroundColor: 'rgba(9,8,6,0.42)' },
  tabBar: {
    backgroundColor: palette.canvas,
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    shadowOpacity: 0,
  },
  tabItem: { borderRadius: radius.lg, paddingHorizontal: space.xs },
  tabLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 46,
  },
  iconWrapActive: { backgroundColor: palette.softClay },
}));
