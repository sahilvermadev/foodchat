import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TranslationKey } from '@/lib/i18n';
import { Chip } from '@/components/ui';
import { KeyboardView } from '@/components/keyboard';
import { OfflineStatus } from '@/components/offline-status';
import { fonts, radius, space } from '@/constants/theme';
import { useAppShell } from '@/features/navigation/shell';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { RecipeCanvas } from '@/features/cook/canvas';
import { ExploreSurface } from '@/features/cook/explore';
import { PersonalKitchen } from '@/features/cook/personal';
import { cookHomeLayout } from '@/features/cook/layout';
import { useCookAttachments } from '@/features/cook/attachments';
import { ConversationMessage } from '@/features/cook/message';
import { useCookState, type CookMessage } from '@/features/cook/state';
import { useCurrentUser, useUpdatePublicProfile } from '@/features/today/queries';

const param = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const progressKey = (type: string): TranslationKey => {
  if (type === 'web_context_loaded') return 'cook.progressResearching';
  if (type.startsWith('tool_') || type.includes('canvas')) return 'cook.progressWorking';
  if (type.startsWith('quality_')) return 'cook.progressFinishing';
  if (type.includes('planner') || type === 'model_routing') return 'cook.progressPlanning';
  return 'cook.progressThinking';
};

function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useStyles();
  const dark = mode === 'dark';
  const currentUser = useCurrentUser();
  const publicProfile = useUpdatePublicProfile();

  const changeMode = (enabled: boolean) => {
    void Haptics.selectionAsync();
    setMode(enabled ? 'dark' : 'light');
  };

  const openPreferences = () => {
    void Haptics.selectionAsync();
    onClose();
    router.push('/preferences');
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable
        accessibilityLabel={t('settings.close')}
        onPress={onClose}
        style={styles.modalBackdrop}
      >
        <Pressable
          accessibilityRole="none"
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.settingsSheet,
            {
              maxHeight: height - insets.top - space.xl,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
        >
          <View style={styles.settingsHandle} />
          <View style={styles.settingsHeader}>
            <View>
              <Text style={styles.settingsTitle}>{t('settings.title')}</Text>
              <Text style={styles.settingsEyebrow}>{t('settings.appearance')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('settings.close')}
              onPress={onClose}
              style={styles.settingsClose}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={18}
                tintColor={colors.ink}
              />
            </Pressable>
          </View>
          <View style={styles.settingsGroup}>
            <View style={[styles.settingsRow, styles.settingsRowDivider]}>
              <View style={styles.settingsIcon}>
                <SymbolView
                  name={{
                    android: dark ? 'dark_mode' : 'light_mode',
                    ios: dark ? 'moon.fill' : 'sun.max.fill',
                  }}
                  size={20}
                  tintColor={dark ? colors.saffron : colors.ember}
                />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsLabel}>{t('settings.darkMode')}</Text>
                <Text style={styles.settingsDescription}>{t('settings.darkModeSubtitle')}</Text>
              </View>
              <Switch
                accessibilityLabel={t('settings.darkMode')}
                onValueChange={changeMode}
                thumbColor={colors.white}
                trackColor={{ false: colors.line, true: colors.ember }}
                value={dark}
              />
            </View>
            <Pressable
              accessibilityHint={t('settings.preferencesHint')}
              accessibilityRole="button"
              onPress={openPreferences}
              style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
            >
              <View style={styles.settingsIcon}>
                <SymbolView
                  name={{ android: 'tune', ios: 'slider.horizontal.3' }}
                  size={20}
                  tintColor={colors.ember}
                />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsLabel}>{t('settings.preferences')}</Text>
                <Text style={styles.settingsDescription}>{t('settings.preferencesSubtitle')}</Text>
              </View>
              <SymbolView
                name={{ android: 'chevron_right', ios: 'chevron.right' }}
                size={18}
                tintColor={colors.inkMuted}
              />
            </Pressable>
            <View style={[styles.settingsRow, styles.settingsRowDivider]}>
              <View style={styles.settingsIcon}>
                <SymbolView
                  name={{ android: 'public', ios: 'person.2' }}
                  size={20}
                  tintColor={colors.ember}
                />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsLabel}>{t('settings.publicProfile')}</Text>
                <Text style={styles.settingsDescription}>
                  {t('settings.publicProfileSubtitle')}
                </Text>
              </View>
              <Switch
                accessibilityLabel={t('settings.publicProfile')}
                disabled={currentUser.isLoading || publicProfile.isPending}
                onValueChange={(value) => {
                  void Haptics.selectionAsync();
                  publicProfile.mutate(value);
                }}
                thumbColor={colors.white}
                trackColor={{ false: colors.line, true: colors.ember }}
                value={Boolean(currentUser.data?.publicProfile)}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CookScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { openHistory } = useAppShell();
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    conversationId?: string | string[];
    prompt?: string | string[];
  }>();
  const initialConversationId = param(params.conversationId);
  const initialPrompt = param(params.prompt);
  const listRef = useRef<FlatList<CookMessage>>(null);
  const composerInputRef = useRef<TextInput>(null);
  const nearBottom = useRef(true);
  const visibleDocumentVersion = useRef<string | undefined>(undefined);
  const initialWindow = useRef(Dimensions.get('window')).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeOffset = useRef(new Animated.Value(12)).current;
  const [input, setInput] = useState(initialPrompt ?? '');
  const [composerActive, setComposerActive] = useState(false);
  const [homeViewportHeight, setHomeViewportHeight] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<'chat' | 'recipe'>('chat');
  const homeLayout = cookHomeLayout({
    fontScale: PixelRatio.getFontScale(),
    height: initialWindow.height,
    width: initialWindow.width,
  });
  const onConversation = useCallback(
    (conversationId: string) => {
      if (pathname === '/home') {
        router.push({ pathname: '/cook', params: { conversationId } });
        return;
      }
      router.setParams({ conversationId });
    },
    [pathname],
  );
  const cook = useCookState({
    initialConversationId,
    onConversation,
  });
  const attachments = useCookAttachments();
  const resetCook = cook.reset;

  useEffect(() => {
    const document = cook.selectedDocument;
    if (!document) return;
    const version = `${document._id}:${document.updatedAt}`;
    if (visibleDocumentVersion.current === version) return;
    visibleDocumentVersion.current = version;
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    setComposerActive(false);
    setWorkspace('recipe');
  }, [cook.selectedDocument]);

  useEffect(() => {
    if (!initialPrompt) return;
    if (!initialConversationId) resetCook();
    setInput(initialPrompt);
  }, [initialConversationId, initialPrompt, resetCook]);

  useEffect(() => {
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      composerInputRef.current?.blur();
      setComposerActive(false);
    });
    return () => {
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (cook.messages.length) return;
    welcomeOpacity.setValue(0);
    welcomeOffset.setValue(12);
    Animated.parallel([
      Animated.timing(welcomeOpacity, {
        duration: 320,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(welcomeOffset, {
        damping: 20,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cook.messages.length, welcomeOffset, welcomeOpacity]);

  const submit = async (value = input) => {
    const text = value.trim();
    if (!text || cook.isStreaming) return;
    setInput('');
    setWorkspace('chat');
    try {
      await cook.send(
        text,
        attachments.attachments.map((attachment) => attachment.file),
      );
      attachments.clear();
    } catch {
      setInput(text);
    }
  };

  const newChat = () => {
    cook.reset();
    setInput('');
    attachments.clear();
    setWorkspace('chat');
    visibleDocumentVersion.current = undefined;
    router.replace('/home');
  };

  const openConversation = (conversationId: string) => {
    cook.reset();
    setInput('');
    setWorkspace('chat');
    visibleDocumentVersion.current = undefined;
    router.push({ pathname: '/cook', params: { conversationId } });
  };

  const leaveConversation = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/home');
  };

  const openRecipeWorkspace = () => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    setComposerActive(false);
    setWorkspace('recipe');
  };

  const isHomeViewport = !cook.messages.length && !cook.selectedDocument;
  const showHome = !cook.messagesLoading && isHomeViewport;
  const homeComposerActive = showHome && composerActive;
  const composer = (
    <View
      style={[
        showHome ? styles.homeComposerGroup : styles.threadComposerGroup,
        !showHome && { paddingBottom: Math.max(insets.bottom, space.md) },
      ]}
    >
      {attachments.attachments.length ? (
        <View style={styles.attachmentTray}>
          {attachments.attachments.map((attachment) => (
            <View key={attachment.file.file_id} style={styles.pendingAttachment}>
              <Image contentFit="cover" source={attachment.uri} style={styles.pendingImage} />
              <Pressable
                accessibilityLabel={t('cook.removeAttachment')}
                onPress={() => attachments.remove(attachment.file.file_id)}
                style={styles.removeAttachment}
              >
                <SymbolView
                  name={{ android: 'close', ios: 'xmark' }}
                  size={12}
                  tintColor={colors.white}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {attachments.error ? <Text style={styles.attachmentError}>{attachments.error}</Text> : null}
      <View
        style={[
          styles.composerShell,
          showHome && styles.homeComposerShell,
          showHome && homeLayout.compact && styles.homeComposerShellCompact,
          composerActive && styles.composerShellFocused,
        ]}
      >
        <Pressable
          accessibilityLabel={t('cook.addPhoto')}
          disabled={attachments.uploading || cook.isStreaming}
          onPress={() => void attachments.pickImage()}
          style={({ pressed }) => [styles.attachButton, pressed && styles.pressed]}
        >
          {attachments.uploading ? (
            <ActivityIndicator color={colors.inkMuted} size="small" />
          ) : (
            <SymbolView
              name={{ android: 'add_photo_alternate', ios: 'photo.badge.plus' }}
              size={21}
              tintColor={colors.inkMuted}
            />
          )}
        </Pressable>
        <TextInput
          editable={!cook.isStreaming}
          multiline
          onChangeText={setInput}
          onFocus={() => {
            setComposerActive(true);
            nearBottom.current = true;
            if (!showHome) {
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            }
          }}
          onSubmitEditing={() => void submit()}
          placeholder={showHome ? t('cook.homeComposer') : t('cook.composer')}
          placeholderTextColor={colors.inkMuted}
          ref={composerInputRef}
          style={[
            styles.composerInput,
            showHome && styles.homeComposerInput,
            showHome && homeLayout.compact && styles.homeComposerInputCompact,
          ]}
          value={input}
        />
        <Pressable
          accessibilityLabel={cook.isStreaming ? t('cook.stop') : t('cook.send')}
          disabled={!input.trim() && !cook.isStreaming}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (cook.isStreaming) {
              cook.stop();
              return;
            }
            void submit();
          }}
          style={[
            styles.sendButton,
            showHome && styles.homeSendButton,
            !input.trim() && !cook.isStreaming && styles.sendButtonDisabled,
          ]}
        >
          {cook.isStreaming ? (
            <SymbolView
              name={{ android: 'stop', ios: 'stop.fill' }}
              size={16}
              tintColor={colors.white}
            />
          ) : (
            <SymbolView
              name={{ android: 'arrow_upward', ios: 'arrow.up' }}
              size={20}
              tintColor={colors.white}
              weight="bold"
            />
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <KeyboardView keyboardVerticalOffset={8} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel={pathname === '/home' ? t('cook.openHistory') : t('cook.backToHome')}
            accessibilityRole="button"
            onPress={() => {
              if (pathname !== '/home') {
                leaveConversation();
                return;
              }
              openHistory({
                activeConversationId: cook.conversationId,
                onNewChat: newChat,
                onSelect: openConversation,
              });
            }}
            style={({ pressed }) => [styles.topBarButton, pressed && styles.pressed]}
          >
            <SymbolView
              name={
                pathname === '/home'
                  ? { android: 'menu', ios: 'line.3.horizontal' }
                  : { android: 'arrow_back', ios: 'chevron.left' }
              }
              size={22}
              tintColor={colors.ink}
            />
          </Pressable>
          <View pointerEvents="none" style={styles.brandLockup}>
            <Text style={styles.brand}>{t('cook.brand')}</Text>
          </View>
          <Pressable
            accessibilityLabel={t('settings.open')}
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.topBarButton, pressed && styles.pressed]}
          >
            <SymbolView
              name={{ android: 'settings', ios: 'gearshape' }}
              size={21}
              tintColor={colors.ink}
            />
          </Pressable>
        </View>
        <OfflineStatus />

        {cook.selectedDocument ? (
          <View accessibilityRole="tablist" style={styles.workspaceTabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: workspace === 'recipe' }}
              onPress={openRecipeWorkspace}
              style={[styles.workspaceTab, workspace === 'recipe' && styles.workspaceTabSelected]}
            >
              <Text
                style={[
                  styles.workspaceTabText,
                  workspace === 'recipe' && styles.workspaceTabTextSelected,
                ]}
              >
                {t('canvas.recipe')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: workspace === 'chat' }}
              onPress={() => setWorkspace('chat')}
              style={[styles.workspaceTab, workspace === 'chat' && styles.workspaceTabSelected]}
            >
              <Text
                style={[
                  styles.workspaceTabText,
                  workspace === 'chat' && styles.workspaceTabTextSelected,
                ]}
              >
                {t('canvas.chat')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {workspace === 'recipe' && cook.selectedDocument ? (
          <RecipeCanvas
            busy={cook.documentBusy}
            document={cook.selectedDocument}
            documents={cook.documents}
            onDelete={(documentId) => void cook.deleteDocument(documentId)}
            onSelect={(documentId) => void cook.selectDocument(documentId)}
          />
        ) : (
          <FlatList
            ListEmptyComponent={
              <>
                {cook.messagesLoading && (
                  <ActivityIndicator color={colors.ember} style={styles.loader} />
                )}
                {showHome && (
                  <Animated.View
                    style={[
                      styles.emptyConversation,
                      homeLayout.compact && styles.emptyConversationCompact,
                      homeComposerActive && styles.emptyConversationFocused,
                      homeViewportHeight && !homeComposerActive
                        ? { minHeight: homeViewportHeight - space.lg - space.md }
                        : null,
                      { opacity: welcomeOpacity, transform: [{ translateY: welcomeOffset }] },
                    ]}
                  >
                    <View
                      style={[
                        styles.homeIntro,
                        homeLayout.compact && styles.homeIntroCompact,
                        homeComposerActive && styles.homeIntroFocused,
                      ]}
                    >
                      {composer}
                    </View>
                    <PersonalKitchen
                      onConversation={openConversation}
                      onRecipe={(recipeId) =>
                        router.push({ pathname: '/recipe', params: { id: recipeId } })
                      }
                    />
                    <View
                      pointerEvents={homeComposerActive ? 'none' : 'auto'}
                      style={homeComposerActive && styles.homeExploreHidden}
                    >
                      <ExploreSurface
                        compact={homeLayout.compact}
                        onAsk={(prompt) => void submit(prompt)}
                      />
                    </View>
                  </Animated.View>
                )}
              </>
            }
            contentContainerStyle={[
              styles.conversation,
              homeComposerActive && styles.conversationFocused,
            ]}
            data={cook.messages}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(message) => message.messageId}
            onContentSizeChange={() => {
              if (nearBottom.current) {
                listRef.current?.scrollToEnd({ animated: !cook.isStreaming });
              }
            }}
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              setHomeViewportHeight((current) => current || height);
            }}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              nearBottom.current =
                contentSize.height - layoutMeasurement.height - contentOffset.y < 120;
            }}
            ref={listRef}
            renderItem={({ item }) => <ConversationMessage message={item} />}
            scrollEnabled
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={!isHomeViewport || homeLayout.allowVerticalScroll}
          />
        )}

        {cook.activeStep ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={colors.ember} size="small" />
            <Text numberOfLines={1} style={styles.thinkingText}>
              {t(progressKey(cook.activeStep.type))}
            </Text>
          </View>
        ) : null}
        {cook.error ? (
          <View accessibilityRole="alert" style={styles.errorBanner}>
            <Text style={styles.errorText}>{cook.error}</Text>
          </View>
        ) : null}
        {workspace === 'chat' && cook.suggestions.length ? (
          <FlatList
            contentContainerStyle={styles.suggestions}
            data={cook.suggestions}
            horizontal
            keyExtractor={(suggestion) => suggestion}
            renderItem={({ item }) => <Chip label={item} onPress={() => void submit(item)} />}
            showsHorizontalScrollIndicator={false}
            style={styles.suggestionRail}
          />
        ) : null}

        {!showHome && workspace === 'chat' ? composer : null}
      </SafeAreaView>
      <SettingsSheet onClose={() => setSettingsOpen(false)} visible={settingsOpen} />
    </KeyboardView>
  );
}

const useStyles = createThemeStyles((palette) => ({
  screen: { backgroundColor: palette.canvas, flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: space.lg },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  topBarButton: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  brandLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    left: 56,
    position: 'absolute',
    right: 56,
    justifyContent: 'center',
  },
  brand: {
    color: palette.ink,
    fontFamily: fonts.brand,
    fontSize: 17,
    letterSpacing: -0.5,
    textTransform: 'lowercase',
  },
  workspaceTabs: {
    alignSelf: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: space.sm,
    padding: 3,
    width: 196,
  },
  workspaceTab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  workspaceTabSelected: { backgroundColor: palette.black },
  workspaceTabText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 12 },
  workspaceTabTextSelected: { color: palette.white, fontFamily: fonts.sansSemibold },
  conversation: { flexGrow: 1, gap: space.lg, paddingBottom: space.lg, paddingTop: space.md },
  conversationFocused: { paddingBottom: 0 },
  loader: { marginTop: space.hero },
  emptyConversation: {
    flexGrow: 1,
    gap: space.xxl,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: space.sm,
  },
  emptyConversationCompact: { gap: space.md },
  emptyConversationFocused: {
    gap: 0,
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  homeIntro: {
    alignSelf: 'center',
    maxWidth: 620,
    paddingTop: space.hero,
    width: '100%',
  },
  homeIntroCompact: { paddingTop: 0 },
  homeIntroFocused: { paddingTop: 0 },
  homeExploreHidden: { opacity: 0, position: 'absolute' },
  thinkingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  thinkingText: { color: palette.inkMuted, flex: 1, fontSize: 12 },
  errorBanner: {
    backgroundColor: palette.dangerSoft,
    borderRadius: radius.md,
    marginBottom: space.sm,
    padding: space.md,
  },
  errorText: { color: palette.danger, fontSize: 13 },
  suggestionRail: { flexGrow: 0, maxHeight: 52 },
  suggestions: { alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  attachmentTray: { flexDirection: 'row', gap: space.sm, paddingBottom: space.sm },
  pendingAttachment: { height: 68, position: 'relative', width: 68 },
  pendingImage: { borderRadius: radius.md, height: 68, width: 68 },
  removeAttachment: {
    alignItems: 'center',
    backgroundColor: palette.black,
    borderRadius: radius.pill,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    top: -5,
    width: 22,
  },
  attachmentError: {
    color: palette.danger,
    fontFamily: fonts.sans,
    fontSize: 12,
    paddingBottom: space.xs,
  },
  homeComposerGroup: { gap: space.sm, width: '100%' },
  threadComposerGroup: { gap: space.xs },
  composerShell: {
    alignItems: 'flex-end',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
    padding: space.md,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  homeComposerShell: {
    alignItems: 'flex-end',
    borderRadius: radius.xl,
    minHeight: 78,
    paddingBottom: space.md,
    paddingTop: space.md,
  },
  homeComposerShellCompact: { minHeight: 64, paddingBottom: space.sm, paddingTop: space.sm },
  composerShellFocused: { borderColor: palette.herb },
  attachButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 34,
  },
  composerInput: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    maxHeight: 112,
    minHeight: 42,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
  },
  homeComposerInput: { minHeight: 48, textAlignVertical: 'top' },
  homeComposerInputCompact: { fontSize: 15, minHeight: 42 },
  sendButton: {
    alignItems: 'center',
    backgroundColor: palette.black,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homeSendButton: { backgroundColor: palette.ember },
  sendButtonDisabled: { opacity: 0.35 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  modalBackdrop: { backgroundColor: 'rgba(9,8,6,0.45)', flex: 1, justifyContent: 'flex-end' },
  settingsSheet: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    gap: space.xl,
    padding: space.xl,
    paddingBottom: space.hero,
    width: '100%',
  },
  settingsHandle: {
    alignSelf: 'center',
    backgroundColor: palette.line,
    borderRadius: radius.pill,
    height: 4,
    width: 40,
  },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  settingsTitle: { color: palette.ink, fontFamily: fonts.serif, fontSize: 28, letterSpacing: -0.7 },
  settingsEyebrow: {
    color: palette.emberDark,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: space.xs,
    textTransform: 'uppercase',
  },
  settingsClose: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  settingsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
  },
  settingsGroup: {
    backgroundColor: palette.canvas,
    borderColor: palette.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsRowDivider: { borderBottomColor: palette.line, borderBottomWidth: 1 },
  settingsIcon: {
    alignItems: 'center',
    backgroundColor: palette.softClay,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  settingsCopy: { flex: 1, gap: 2 },
  settingsLabel: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 15 },
  settingsDescription: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
}));
