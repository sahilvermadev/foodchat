import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecentConversation } from '@/features/today/queries';
import { fonts, radius, space } from '@/constants/theme';
import { useAuth } from '@/features/auth/provider';
import { useRecentConversations } from '@/features/today/queries';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';

type HistorySectionId = 'today' | 'week' | 'older' | 'results';
type HistorySection = { id: HistorySectionId; data: RecentConversation[] };

const conversationDate = (updatedAt?: string) => {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
};

const groupConversations = (
  conversations: RecentConversation[],
  searching: boolean,
): HistorySection[] => {
  if (searching) return conversations.length ? [{ id: 'results', data: conversations }] : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = today.getTime() - 6 * 24 * 60 * 60 * 1000;
  const groups: Record<'today' | 'week' | 'older', RecentConversation[]> = {
    today: [],
    week: [],
    older: [],
  };

  for (const conversation of conversations) {
    const updated = conversation.updatedAt ? new Date(conversation.updatedAt).getTime() : 0;
    if (updated >= today.getTime()) groups.today.push(conversation);
    else if (updated >= weekAgo) groups.week.push(conversation);
    else groups.older.push(conversation);
  }

  return (['today', 'week', 'older'] as const)
    .filter((id) => groups[id].length)
    .map((id) => ({ id, data: groups[id] }));
};

function ConversationRow({
  conversation,
  selected,
  onPress,
}: {
  conversation: RecentConversation;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.conversation,
        selected && styles.conversationSelected,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={{ android: 'chat_bubble_outline', ios: 'bubble.left' }}
        size={17}
        tintColor={selected ? colors.ember : colors.inkMuted}
      />
      <View style={styles.conversationCopy}>
        <Text numberOfLines={1} style={styles.conversationTitle}>
          {conversation.title || t('cook.untitledChat')}
        </Text>
        {conversation.updatedAt ? (
          <Text style={styles.conversationDate}>{conversationDate(conversation.updatedAt)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function HistoryDrawer({
  activeConversationId,
  onClose,
  onNewChat,
  onSelect,
}: {
  activeConversationId?: string;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const auth = useAuth();
  const conversationsQuery = useRecentConversations(30);
  const [search, setSearch] = useState('');
  const filteredConversations = useMemo(() => {
    const conversations = conversationsQuery.data?.conversations ?? [];
    const query = search.trim().toLocaleLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      conversation.title?.toLocaleLowerCase().includes(query),
    );
  }, [conversationsQuery.data?.conversations, search]);
  const sections = useMemo(
    () => groupConversations(filteredConversations, Boolean(search.trim())),
    [filteredConversations, search],
  );

  const sectionTitle = (id: HistorySectionId) => {
    if (id === 'today') return t('cook.historyToday');
    if (id === 'week') return t('cook.historyWeek');
    if (id === 'older') return t('cook.historyOlder');
    return t('cook.historyResults');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.drawerSafeArea}>
      <View style={styles.drawerHeader}>
        <Text style={styles.brand}>{t('cook.brand')}</Text>
        <Pressable
          accessibilityLabel={t('cook.closeHistory')}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <SymbolView name={{ android: 'close', ios: 'xmark' }} size={20} tintColor={colors.ink} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose();
          onNewChat();
        }}
        style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}
      >
        <SymbolView
          name={{ android: 'edit_square', ios: 'square.and.pencil' }}
          size={19}
          tintColor={colors.white}
        />
        <Text style={styles.newChatText}>{t('cook.newChat')}</Text>
      </Pressable>

      <View style={styles.search}>
        <SymbolView
          name={{ android: 'search', ios: 'magnifyingglass' }}
          size={18}
          tintColor={colors.inkMuted}
        />
        <TextInput
          accessibilityLabel={t('cook.searchHistory')}
          onChangeText={setSearch}
          placeholder={t('cook.searchHistory')}
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          value={search}
        />
      </View>

      <SectionList
        contentContainerStyle={styles.list}
        sections={sections}
        keyExtractor={(conversation) => conversation.conversationId}
        ListEmptyComponent={
          conversationsQuery.isLoading ? (
            <ActivityIndicator color={colors.ember} style={styles.loader} />
          ) : (
            <Text style={styles.empty}>
              {search ? t('cook.noHistoryMatches') : t('cook.noHistory')}
            </Text>
          )
        }
        onRefresh={() => void conversationsQuery.refetch()}
        refreshing={conversationsQuery.isRefetching}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => {
              onClose();
              onSelect(item.conversationId);
            }}
            selected={item.conversationId === activeConversationId}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionLabel}>{sectionTitle(section.id)}</Text>
        )}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />

      <View style={styles.footer}>
        <View style={styles.profileMark}>
          <Text style={styles.profileMarkText}>R</Text>
        </View>
        <Text numberOfLines={1} style={styles.profileName}>
          {auth.user?.name ?? auth.user?.username ?? auth.user?.email}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void auth.logout()}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  drawerSafeArea: {
    backgroundColor: palette.canvas,
    flex: 1,
    paddingHorizontal: space.lg,
  },
  drawerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  brand: {
    color: palette.ember,
    fontFamily: fonts.brand,
    fontSize: 17,
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  newChat: {
    alignItems: 'center',
    backgroundColor: palette.black,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  newChatText: { color: palette.white, fontFamily: fonts.sans, fontSize: 14, fontWeight: '800' },
  search: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.md,
  },
  searchInput: { color: palette.ink, flex: 1, fontFamily: fonts.sans, fontSize: 14, minHeight: 46 },
  list: { flexGrow: 1, paddingBottom: space.lg },
  sectionLabel: {
    backgroundColor: palette.canvas,
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    paddingBottom: space.sm,
    paddingTop: space.xl,
    textTransform: 'uppercase',
  },
  loader: { marginTop: space.xl },
  empty: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingVertical: space.xl,
  },
  conversation: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 54,
    paddingHorizontal: space.md,
  },
  conversationSelected: { backgroundColor: palette.herbSoft },
  conversationCopy: { flex: 1, gap: 2 },
  conversationTitle: {
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  conversationDate: { color: palette.inkMuted, fontFamily: fonts.mono, fontSize: 10 },
  footer: {
    alignItems: 'center',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    minHeight: 68,
  },
  profileMark: {
    alignItems: 'center',
    backgroundColor: palette.plum,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  profileMarkText: { color: palette.white, fontFamily: fonts.serif, fontWeight: '800' },
  profileName: { color: palette.ink, flex: 1, fontFamily: fonts.sans, fontSize: 13 },
  signOut: { paddingVertical: space.sm },
  signOutText: {
    color: palette.emberDark,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: { opacity: 0.68 },
}));
