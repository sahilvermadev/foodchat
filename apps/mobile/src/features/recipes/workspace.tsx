import { Fragment, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { SymbolView } from 'expo-symbols';

import {
  canonicalEquipmentName,
  deriveRecipeFacts,
  verifiedDietClaims,
} from 'librechat-data-provider/mobile';
import type { CookingTimer, RecipeWorkspaceState, StructuredRecipe } from 'librechat-data-provider';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import type { RecipeSupplement } from './content';
import { AddIngredientsReview } from '@/features/shopping/review';
import { useAuth } from '@/features/auth/provider';
import { useConnectivity } from '@/features/connectivity/provider';
import { cacheOfflineWorkspaceState, getOfflineWorkspaceState } from '@/features/offline/cooking';
import { useAddShoppingItems } from '@/features/shopping/queries';
import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import type { UnitMode } from './workspace-format';
import { ingredientParts, restoredTimerState, scaledYieldText } from './workspace-format';

type RecipeWorkspaceMetadata = {
  diet?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  equipment?: string[];
  potentialAllergens?: string[];
};

export type ActiveTimerState = {
  endsAt?: number;
  id: string;
  label: string;
  remaining: number;
  running: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const timerText = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const stepParts = (text: string) => {
  const match = text.match(/^([^:]{2,64}):\s*(.+)$/s);
  return match ? { body: match[2], title: match[1] } : { body: text };
};

function SupplementSection({ title, values }: { title: string; values: string[] }) {
  const styles = useStyles();
  if (!values.length) return null;
  return (
    <View style={styles.supplementSection}>
      <Text style={styles.heading}>{title}</Text>
      {values.map((value) => (
        <Text key={value} style={styles.supplementText}>
          {value}
        </Text>
      ))}
    </View>
  );
}

function RecipeTag({
  accessibilityLabel,
  label,
  tone,
}: {
  accessibilityLabel?: string;
  label: string;
  tone: 'allergen' | 'diet' | 'neutral';
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.recipeTag,
        tone === 'allergen' && styles.recipeTagAllergen,
        tone === 'diet' && styles.recipeTagDiet,
      ]}
    >
      {tone === 'allergen' ? (
        <SymbolView
          name={{ android: 'warning_amber', ios: 'exclamationmark.triangle.fill' }}
          size={13}
          tintColor={colors.saffron}
        />
      ) : null}
      <Text
        style={[
          styles.recipeTagText,
          tone === 'allergen' && styles.recipeTagTextAllergen,
          tone === 'diet' && styles.recipeTagTextDiet,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function KitchenTimer({
  initialState,
  onStateChange,
  timer,
}: {
  initialState?: ActiveTimerState;
  onStateChange?(state?: ActiveTimerState): void;
  timer: CookingTimer;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const initial = restoredTimerState(initialState, timer.durationSeconds);
  const [remaining, setRemaining] = useState(initial.remaining);
  const [running, setRunning] = useState(initial.running);
  const endsAt = useRef<number | undefined>(initial.endsAt);
  const notificationId = useRef<string | undefined>(undefined);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!initialState) return;
    const restored = restoredTimerState(initialState, timer.durationSeconds);
    endsAt.current = restored.endsAt;
    setRemaining(restored.remaining);
    setRunning(restored.running);
  }, [initialState, timer.durationSeconds]);

  const cancelNotification = () => {
    if (!notificationId.current) return;
    void Notifications.cancelScheduledNotificationAsync(notificationId.current);
    notificationId.current = undefined;
  };

  const scheduleNotification = async (seconds: number) => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('cooking-timers', {
        importance: Notifications.AndroidImportance.HIGH,
        name: 'Cooking timers',
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    cancelNotification();
    notificationId.current = await Notifications.scheduleNotificationAsync({
      content: {
        body: `${timer.label || t('canvas.timer')} is done.`,
        sound: true,
        title: t('recipe.timerFinished'),
      },
      trigger: {
        channelId: 'cooking-timers',
        repeats: false,
        seconds,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });
  };

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(next);
      if (next > 0) return;
      setRunning(false);
      endsAt.current = undefined;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    const interval = setInterval(tick, 500);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    tick();
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [running]);

  useEffect(() => {
    const active = running || remaining !== timer.durationSeconds;
    onStateChangeRef.current?.(
      active
        ? {
            id: timer.id,
            endsAt: endsAt.current,
            label: timer.label || t('canvas.timer'),
            remaining,
            running,
          }
        : undefined,
    );
  }, [remaining, running, t, timer.durationSeconds, timer.id, timer.label]);

  useEffect(() => () => onStateChangeRef.current?.(undefined), []);

  const toggle = () => {
    void Haptics.selectionAsync();
    if (running) {
      setRemaining(Math.max(0, Math.ceil(((endsAt.current ?? Date.now()) - Date.now()) / 1000)));
      endsAt.current = undefined;
      setRunning(false);
      cancelNotification();
      return;
    }
    const next = remaining || timer.durationSeconds;
    setRemaining(next);
    endsAt.current = Date.now() + next * 1000;
    setRunning(true);
    void scheduleNotification(next).catch(() => undefined);
  };

  let androidIcon: AndroidSymbol = 'play_arrow';
  let iosIcon: SFSymbol = 'play.fill';
  if (running) {
    androidIcon = 'pause';
    iosIcon = 'pause.fill';
  } else if (!remaining) {
    androidIcon = 'replay';
    iosIcon = 'arrow.clockwise';
  }

  return (
    <View style={[styles.timer, running && styles.timerRunning]}>
      <Pressable
        accessibilityLabel={`${timer.label || t('canvas.timer')}, ${timerText(remaining)}`}
        accessibilityRole="button"
        onPress={toggle}
        style={styles.timerPrimary}
      >
        <SymbolView
          name={{ android: androidIcon, ios: iosIcon }}
          size={15}
          tintColor={running ? colors.saffron : colors.ink}
        />
        <Text style={styles.timerLabel}>{timer.label || t('canvas.timer')}</Text>
        <Text style={styles.timerValue}>{timerText(remaining)}</Text>
      </Pressable>
      {remaining !== timer.durationSeconds ? (
        <Pressable
          accessibilityLabel={t('canvas.resetTimer')}
          hitSlop={8}
          onPress={() => {
            setRunning(false);
            endsAt.current = undefined;
            setRemaining(timer.durationSeconds);
            cancelNotification();
          }}
        >
          <SymbolView
            name={{ android: 'refresh', ios: 'arrow.counterclockwise' }}
            size={15}
            tintColor={colors.inkMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

export function RecipeWorkspace({
  initialNotes = '',
  initialWorkspaceState,
  isCooked = false,
  metadata,
  onMarkCooked,
  onNotesChange,
  onTimerChange,
  onWorkspaceStateChange,
  recipe,
  supplement,
  workspaceId,
  yieldText,
}: {
  initialNotes?: string;
  initialWorkspaceState?: RecipeWorkspaceState;
  isCooked?: boolean;
  metadata?: RecipeWorkspaceMetadata;
  onMarkCooked?(): void;
  onNotesChange?(notes: string): void;
  onTimerChange?(timerId: string, state?: ActiveTimerState): void;
  onWorkspaceStateChange?(state: Omit<RecipeWorkspaceState, 'updatedAt'>): void;
  recipe: StructuredRecipe;
  supplement?: RecipeSupplement;
  workspaceId: string;
  yieldText?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const { colors } = useTheme();
  const styles = useStyles();
  const [servings, setServings] = useState(Math.max(1, recipe.servings || 1));
  const [unitMode, setUnitMode] = useState<UnitMode>('original');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [focusedStepId, setFocusedStepId] = useState<string>();
  const [shoppingReviewOpen, setShoppingReviewOpen] = useState(false);
  const [shoppingNotice, setShoppingNotice] = useState<string>();
  const [timers, setTimers] = useState<Record<string, ActiveTimerState>>({});
  const onWorkspaceStateChangeRef = useRef(onWorkspaceStateChange);
  onWorkspaceStateChangeRef.current = onWorkspaceStateChange;
  const addShoppingItems = useAddShoppingItems();
  const originalServings = Math.max(1, recipe.servings || 1);
  const scale = servings / originalServings;
  const originalYield =
    scaledYieldText({
      baseServings: originalServings,
      currentServings: originalServings,
      yieldText,
    }) ?? t('recipe.servings', { count: originalServings });
  const currentYield =
    scaledYieldText({ baseServings: originalServings, currentServings: servings, yieldText }) ??
    t('recipe.servings', { count: servings });
  const isScaled = servings !== originalServings;

  useEffect(() => {
    setShoppingReviewOpen(false);
    setEquipmentOpen(false);
    void (user ? getOfflineWorkspaceState(user.id, workspaceId) : Promise.resolve(null)).then(
      (saved) => {
        const remoteUpdatedAt = initialWorkspaceState?.updatedAt
          ? Date.parse(initialWorkspaceState.updatedAt)
          : 0;
        const localUpdatedAt = saved?.updatedAt ? Date.parse(saved.updatedAt) : 0;
        const useLocal = Boolean(saved && localUpdatedAt > remoteUpdatedAt);
        const selectedServings = useLocal ? saved?.servings : initialWorkspaceState?.servings;
        const selectedUnitMode = useLocal ? saved?.unitMode : initialWorkspaceState?.unitMode;
        const selectedChecked = useLocal
          ? saved?.checked
          : Object.fromEntries(
              (initialWorkspaceState?.checkedIngredientIds ?? []).map((id) => [id, true]),
            );
        const selectedTimers = useLocal
          ? saved?.timers
          : Object.fromEntries(
              (initialWorkspaceState?.timers ?? []).map((timer) => [timer.id, timer]),
            );
        const initial = initialNotes || saved?.notes || '';
        setNotes(initial);
        setNotesOpen(Boolean(initial));
        setServings(Math.max(1, selectedServings ?? recipe.servings ?? 1));
        setUnitMode(selectedUnitMode ?? 'original');
        setChecked(selectedChecked ?? {});
        setTimers(selectedTimers ?? {});
        if (useLocal && saved) {
          onWorkspaceStateChangeRef.current?.({
            checkedIngredientIds: Object.entries(saved.checked)
              .filter(([, value]) => value)
              .map(([id]) => id),
            servings: Math.max(1, saved.servings ?? recipe.servings ?? 1),
            timers: Object.values(saved.timers ?? {}),
            unitMode: saved.unitMode ?? 'original',
          });
        }
      },
    );
  }, [
    initialNotes,
    initialWorkspaceState?.checkedIngredientIds,
    initialWorkspaceState?.servings,
    initialWorkspaceState?.timers,
    initialWorkspaceState?.unitMode,
    initialWorkspaceState?.updatedAt,
    recipe.servings,
    user,
    workspaceId,
  ]);

  const persistWorkspace = (
    nextNotes: string,
    nextChecked: Record<string, boolean>,
    nextTimers = timers,
    nextServings = servings,
    nextUnitMode = unitMode,
  ) => {
    if (!user) return;
    const state = {
      checked: nextChecked,
      notes: nextNotes,
      servings: nextServings,
      timers: nextTimers,
      unitMode: nextUnitMode,
      updatedAt: new Date().toISOString(),
    };
    void cacheOfflineWorkspaceState(user.id, workspaceId, state);
    onWorkspaceStateChangeRef.current?.({
      servings: nextServings,
      unitMode: nextUnitMode,
      checkedIngredientIds: Object.entries(nextChecked)
        .filter(([, value]) => value)
        .map(([id]) => id),
      timers: Object.values(nextTimers),
    });
  };

  const updateChecked = (ingredientId: string) => {
    setChecked((current) => {
      const next = { ...current, [ingredientId]: !current[ingredientId] };
      persistWorkspace(notes, next);
      return next;
    });
  };

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const facts = deriveRecipeFacts(recipe);
  const equipment = Array.from(
    new Set(
      [
        ...(metadata?.equipment ?? []),
        ...(supplement?.equipment ?? []),
        ...facts.equipment.map((item) => item.value),
      ].map(canonicalEquipmentName),
    ),
  );
  const allergens =
    metadata?.potentialAllergens ?? facts.potentialAllergens.map((item) => item.value);
  const diets =
    metadata?.diet ??
    verifiedDietClaims(
      recipe.tags.filter((tag) =>
        /^(vegan|vegetarian|pescatarian|gluten[- ]free|dairy[- ]free|egg[- ]free|nut[- ]free|soy[- ]free)$/i.test(
          tag,
        ),
      ),
      recipe,
    );
  const difficulty = metadata?.difficulty ?? recipe.difficulty;
  let notesStatus = t('recipe.notesSaved');
  if (onNotesChange && isOnline) notesStatus = t('recipe.notesSynced');
  else if (onNotesChange) notesStatus = t('recipe.notesPending');

  return (
    <View style={styles.workspace}>
      {difficulty || diets.length || allergens.length ? (
        <View style={styles.recipeTags}>
          {difficulty ? <RecipeTag label={difficulty} tone="neutral" /> : null}
          {diets.map((diet) => (
            <RecipeTag key={diet} label={diet} tone="diet" />
          ))}
          {allergens.map((allergen) => (
            <RecipeTag
              accessibilityLabel={`${t('recipe.potentialAllergens')}: ${t('recipe.allergenNotice', {
                allergens: allergen,
              })}`}
              key={allergen}
              label={allergen}
              tone="allergen"
            />
          ))}
        </View>
      ) : null}
      {equipment.length ? (
        <View style={styles.equipmentSection}>
          <Pressable
            accessibilityLabel={t(equipmentOpen ? 'recipe.hideEquipment' : 'recipe.showEquipment', {
              count: equipment.length,
            })}
            accessibilityRole="button"
            accessibilityState={{ expanded: equipmentOpen }}
            onPress={() => setEquipmentOpen((current) => !current)}
            style={styles.equipmentDisclosure}
          >
            <View style={styles.equipmentSummary}>
              <Text style={styles.equipmentLabel}>{t('recipe.equipment')}</Text>
              <Text style={styles.equipmentCount}>
                {t('recipe.equipmentCount', { count: equipment.length })}
              </Text>
            </View>
            <SymbolView
              name={{
                android: equipmentOpen ? 'expand_less' : 'expand_more',
                ios: equipmentOpen ? 'chevron.up' : 'chevron.down',
              }}
              size={17}
              tintColor={colors.inkMuted}
            />
          </Pressable>
          {equipmentOpen ? (
            <View style={styles.equipmentTags}>
              {equipment.map((item) => (
                <RecipeTag key={item} label={item} tone="neutral" />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <SupplementSection title={t('recipe.makeAhead')} values={supplement?.makeAhead ?? []} />

      <View style={styles.ingredientsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.heading}>{t('recipe.ingredients')}</Text>
          <Pressable accessibilityRole="button" onPress={() => setShoppingReviewOpen(true)}>
            <Text style={styles.sectionAction}>{t('recipe.addToShoppingList')}</Text>
          </Pressable>
        </View>
        {shoppingNotice ? (
          <Pressable
            accessibilityLiveRegion="polite"
            accessibilityRole="button"
            onPress={() => setShoppingNotice(undefined)}
            style={styles.shoppingNotice}
          >
            <SymbolView
              name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }}
              size={16}
              tintColor={colors.herb}
            />
            <Text style={styles.shoppingNoticeText}>{shoppingNotice}</Text>
          </Pressable>
        ) : null}
        <View style={styles.scaleRow}>
          <View style={styles.scaleCopy}>
            <Text style={styles.scaleLabel}>{t('recipe.scaleRecipe')}</Text>
            <Text style={styles.scaleValue}>{currentYield}</Text>
          </View>
          <View style={styles.servingControl}>
            <Pressable
              accessibilityLabel={t('recipe.decreaseYield')}
              accessibilityRole="button"
              accessibilityState={{ disabled: servings <= 1 }}
              disabled={servings <= 1}
              hitSlop={4}
              onPress={() =>
                setServings((value) => {
                  const next = Math.max(1, value - 1);
                  persistWorkspace(notes, checked, timers, next, unitMode);
                  return next;
                })
              }
              style={[styles.stepperButton, servings <= 1 && styles.stepperButtonDisabled]}
            >
              <SymbolView
                name={{ android: 'remove', ios: 'minus' }}
                size={15}
                tintColor={colors.ink}
              />
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={styles.toolValue}>
              {servings}
            </Text>
            <Pressable
              accessibilityLabel={t('recipe.increaseYield')}
              accessibilityRole="button"
              hitSlop={4}
              onPress={() =>
                setServings((value) => {
                  const next = value + 1;
                  persistWorkspace(notes, checked, timers, next, unitMode);
                  return next;
                })
              }
              style={styles.stepperButton}
            >
              <SymbolView name={{ android: 'add', ios: 'plus' }} size={15} tintColor={colors.ink} />
            </Pressable>
          </View>
        </View>
        {isScaled ? (
          <View style={styles.scaleNotice}>
            <Text style={styles.scaleNoticeText}>
              {t('recipe.scaledTimingNote', { yield: originalYield })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setServings(originalServings);
                persistWorkspace(notes, checked, timers, originalServings, unitMode);
              }}
            >
              <Text style={styles.useOriginalAction}>{t('recipe.useOriginalYield')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View accessibilityRole="tablist" style={styles.unitTabs}>
          {(['original', 'metric', 'imperial'] as const).map((mode) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: unitMode === mode }}
              key={mode}
              onPress={() => {
                setUnitMode(mode);
                persistWorkspace(notes, checked, timers, servings, mode);
              }}
              style={[styles.unitTab, unitMode === mode && styles.unitTabSelected]}
            >
              <Text style={[styles.unitText, unitMode === mode && styles.unitTextSelected]}>
                {t(`recipe.units.${mode}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {checkedCount ? (
          <View style={styles.checklistToolbar}>
            <Text style={styles.checklistStatus}>
              {t('recipe.checkedIngredients', { count: checkedCount })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setChecked({});
                persistWorkspace(notes, {});
              }}
            >
              <Text style={styles.uncheckAction}>{t('recipe.uncheckAll')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.ingredients}>
          {recipe.ingredients.map((ingredient, index) => {
            const selected = Boolean(checked[ingredient.id]);
            const parts = ingredientParts(ingredient, scale, unitMode);
            const showGroup = Boolean(
              ingredient.group && ingredient.group !== recipe.ingredients[index - 1]?.group,
            );
            return (
              <Fragment key={ingredient.id}>
                {showGroup ? <Text style={styles.ingredientGroup}>{ingredient.group}</Text> : null}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => updateChecked(ingredient.id)}
                  style={styles.ingredient}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? (
                      <SymbolView
                        name={{ android: 'check', ios: 'checkmark' }}
                        size={13}
                        tintColor={colors.white}
                      />
                    ) : null}
                  </View>
                  {parts.amount ? (
                    <Text style={[styles.ingredientAmount, selected && styles.checkedText]}>
                      {parts.amount}
                    </Text>
                  ) : null}
                  <View style={styles.ingredientNameRow}>
                    <Text style={[styles.ingredientText, selected && styles.checkedText]}>
                      {parts.name}
                    </Text>
                    {ingredient.optional ? (
                      <Text style={styles.optional}>{t('recipe.optional')}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </Fragment>
            );
          })}
        </View>
      </View>

      <SupplementSection title={t('recipe.safety')} values={supplement?.safety ?? []} />
      <Text style={styles.heading}>{t('recipe.steps')}</Text>
      <View style={styles.steps}>
        {recipe.steps.map((step, index) => {
          const parts = stepParts(step.text);
          const focused = focusedStepId === step.id;
          return (
            <View key={step.id} style={[styles.step, focused && styles.stepFocused]}>
              <Pressable
                accessibilityLabel={t(focused ? 'recipe.unfocusStep' : 'recipe.focusStep', {
                  count: index + 1,
                })}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                onPress={() => setFocusedStepId(focused ? undefined : step.id)}
              >
                <Text style={[styles.stepNumber, focused && styles.stepNumberFocused]}>
                  {index + 1}
                </Text>
              </Pressable>
              <View style={styles.stepCopy}>
                {parts.title ? <Text style={styles.stepTitle}>{parts.title}</Text> : null}
                <Text style={styles.stepText}>{parts.body}</Text>
                {step.temperature ? (
                  <Text style={styles.temperature}>
                    {step.temperature.value}°{step.temperature.unit}
                    {step.temperature.appliance ? ` · ${step.temperature.appliance}` : ''}
                  </Text>
                ) : null}
                {step.timers?.map((timer) => (
                  <KitchenTimer
                    initialState={timers[timer.id]}
                    key={timer.id}
                    onStateChange={(state) => {
                      setTimers((current) => {
                        const previous = current[timer.id];
                        const next = { ...current };
                        if (state) next[timer.id] = state;
                        else delete next[timer.id];
                        const stateChanged =
                          (!previous && Boolean(state)) ||
                          (Boolean(previous) && !state) ||
                          previous?.running !== state?.running ||
                          previous?.endsAt !== state?.endsAt;
                        if (stateChanged) persistWorkspace(notes, checked, next);
                        return next;
                      });
                      onTimerChange?.(timer.id, state);
                    }}
                    timer={timer}
                  />
                ))}
                {step.tips?.map((tip) => (
                  <View key={tip} style={styles.tip}>
                    <Text style={styles.tipLabel}>{t('canvas.tip')}</Text>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
                {step.warnings?.map((warning) => (
                  <View key={warning} style={styles.warning}>
                    <Text style={styles.warningText}>{warning}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {recipe.notes.length ? (
        <View style={styles.notes}>
          <Text style={styles.heading}>{t('canvas.notes')}</Text>
          {recipe.notes.map((note) => (
            <Text key={note} style={styles.note}>
              • {note}
            </Text>
          ))}
        </View>
      ) : null}
      <SupplementSection
        title={t('recipe.substitutions')}
        values={supplement?.substitutions ?? []}
      />
      <SupplementSection title={t('recipe.storage')} values={supplement?.storage ?? []} />
      <SupplementSection title={t('recipe.nutrition')} values={supplement?.nutrition ?? []} />
      <View style={styles.personalNotes}>
        {notesOpen ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.heading}>{t('recipe.personalNotes')}</Text>
              <Pressable accessibilityRole="button" onPress={() => setNotesOpen(false)}>
                <Text style={styles.sectionAction}>{t('recipe.done')}</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel={t('recipe.personalNotes')}
              multiline
              onBlur={() => onNotesChange?.(notes)}
              onChangeText={(value) => {
                setNotes(value);
                persistWorkspace(value, checked);
              }}
              placeholder={t('recipe.personalNotesPlaceholder')}
              placeholderTextColor={colors.inkMuted}
              style={styles.notesInput}
              value={notes}
            />
            <Text style={styles.savedLocally}>{notesStatus}</Text>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setNotesOpen(true)}
            style={styles.addNote}
          >
            <SymbolView name={{ android: 'add', ios: 'plus' }} size={16} tintColor={colors.ember} />
            <Text style={styles.addNoteText}>
              {notes ? t('recipe.editPersonalNotes') : t('recipe.addPersonalNote')}
            </Text>
          </Pressable>
        )}
      </View>
      {onMarkCooked ? (
        <Pressable
          accessibilityRole="button"
          disabled={isCooked}
          onPress={onMarkCooked}
          style={[styles.markCooked, isCooked && styles.markCookedComplete]}
        >
          <SymbolView
            name={{ android: 'done', ios: 'checkmark' }}
            size={17}
            tintColor={isCooked ? colors.herb : colors.white}
          />
          <Text style={[styles.markCookedText, isCooked && styles.markCookedTextComplete]}>
            {t(isCooked ? 'recipe.cooked' : 'recipe.markCooked')}
          </Text>
        </Pressable>
      ) : null}
      {shoppingReviewOpen ? (
        <AddIngredientsReview
          initialServings={servings}
          onAdd={(items) => {
            setShoppingReviewOpen(false);
            void addShoppingItems
              .mutateAsync(items)
              .then(() =>
                setShoppingNotice(
                  items.length === 1
                    ? t('shopping.addedOne')
                    : t('shopping.addedCount', { count: items.length }),
                ),
              )
              .catch(() => setShoppingNotice(t('shopping.updateError')));
          }}
          onClose={() => setShoppingReviewOpen(false)}
          recipe={recipe}
          recipeId={workspaceId.startsWith('saved:') ? workspaceId.slice(6) : workspaceId}
          visible
        />
      ) : null}
    </View>
  );
}

export function ActiveTimerDock({ timers }: { timers: ActiveTimerState[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!timers.length) return null;
  const timer = timers[0];
  return (
    <View accessibilityLiveRegion="polite" style={styles.timerDock}>
      <SymbolView
        name={{ android: 'timer', ios: 'timer' }}
        size={17}
        tintColor={timer.running ? colors.saffron : colors.ember}
      />
      <Text numberOfLines={1} style={styles.timerDockLabel}>
        {timer.label}
      </Text>
      <Text style={styles.timerDockValue}>{timerText(timer.remaining)}</Text>
      {timers.length > 1 ? <Text style={styles.timerDockCount}>+{timers.length - 1}</Text> : null}
    </View>
  );
}

const useStyles = createThemeStyles((palette) => ({
  workspace: { gap: space.xl },
  scaleRow: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  scaleCopy: { flex: 1, gap: 2 },
  scaleLabel: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  scaleValue: { color: palette.ink, fontFamily: fonts.recipeBodyBold, fontSize: 14 },
  servingControl: { alignItems: 'center', flexDirection: 'row' },
  toolValue: {
    color: palette.ink,
    fontFamily: fonts.recipeBodyBold,
    fontSize: 15,
    minWidth: 22,
    textAlign: 'center',
  },
  stepperButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 32,
  },
  stepperButtonDisabled: { opacity: 0.35 },
  scaleNotice: {
    alignItems: 'flex-start',
    backgroundColor: palette.canvasRaised,
    borderRadius: radius.sm,
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  scaleNoticeText: {
    color: palette.inkMuted,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
  },
  useOriginalAction: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 11 },
  unitTabs: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  unitTab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 2,
  },
  unitTabSelected: { borderBottomColor: palette.ember },
  unitText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 10 },
  unitTextSelected: { color: palette.ember, fontFamily: fonts.sansSemibold },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionAction: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 12 },
  checklistToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  checklistStatus: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  uncheckAction: { color: palette.inkMuted, fontFamily: fonts.sansSemibold, fontSize: 11 },
  heading: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 24 },
  recipeTags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  recipeTag: {
    alignItems: 'center',
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  recipeTagDiet: { backgroundColor: palette.herbSoft, borderColor: palette.herb },
  recipeTagAllergen: { backgroundColor: palette.softClay, borderColor: palette.saffron },
  recipeTagText: {
    color: palette.inkMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  recipeTagTextDiet: { color: palette.herb },
  recipeTagTextAllergen: { color: palette.ink },
  equipmentSection: {
    borderTopColor: palette.line,
    borderTopWidth: 1,
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
  },
  equipmentDisclosure: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
  },
  equipmentSummary: { alignItems: 'baseline', flexDirection: 'row', gap: space.sm },
  equipmentLabel: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  equipmentCount: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  equipmentTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingBottom: space.md,
  },
  supplementSection: { gap: space.sm },
  supplementText: {
    color: palette.ink,
    fontFamily: fonts.recipeBody,
    fontSize: 14,
    lineHeight: 22,
  },
  ingredientsSection: { gap: space.sm },
  shoppingNotice: {
    alignItems: 'center',
    backgroundColor: palette.herbSoft,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
  },
  shoppingNoticeText: { color: palette.herb, flex: 1, fontFamily: fonts.sansMedium, fontSize: 12 },
  ingredients: { gap: space.xs },
  ingredientGroup: {
    color: palette.ember,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 0.7,
    marginTop: space.md,
    textTransform: 'uppercase',
  },
  ingredient: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 44,
    paddingVertical: 5,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 6,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  checkboxSelected: { backgroundColor: palette.herb, borderColor: palette.herb },
  ingredientAmount: {
    color: palette.ink,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    minWidth: 62,
  },
  ingredientNameRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space.sm },
  ingredientText: {
    color: palette.ink,
    flex: 1,
    fontFamily: fonts.recipeBody,
    fontSize: 15,
    lineHeight: 23,
  },
  optional: {
    color: palette.inkMuted,
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  checkedText: { color: palette.inkMuted, textDecorationLine: 'line-through' },
  steps: { gap: space.xl },
  step: {
    alignItems: 'flex-start',
    borderLeftColor: 'transparent',
    borderLeftWidth: 2,
    flexDirection: 'row',
    gap: space.md,
    marginLeft: -space.sm,
    paddingLeft: space.sm,
  },
  stepFocused: { borderLeftColor: palette.ember },
  stepNumber: {
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    color: palette.white,
    fontFamily: fonts.mono,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stepNumberFocused: { backgroundColor: palette.herb },
  stepCopy: { flex: 1, gap: space.md },
  stepTitle: { color: palette.ink, fontFamily: fonts.recipeBodyBold, fontSize: 17, lineHeight: 23 },
  stepText: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 16, lineHeight: 26 },
  temperature: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 12 },
  timer: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.softClay,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  timerRunning: { backgroundColor: palette.black },
  timerPrimary: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  timerLabel: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 12 },
  timerValue: { color: palette.ember, fontFamily: fonts.mono, fontSize: 12 },
  timerDock: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.black,
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: space.lg,
    flexDirection: 'row',
    gap: space.sm,
    left: space.xl,
    minHeight: 44,
    paddingHorizontal: space.md,
    position: 'absolute',
    right: space.xl,
    zIndex: 20,
  },
  timerDockLabel: { color: palette.white, flex: 1, fontFamily: fonts.sansSemibold, fontSize: 12 },
  timerDockValue: { color: palette.saffron, fontFamily: fonts.mono, fontSize: 13 },
  timerDockCount: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  tip: { backgroundColor: palette.herbSoft, borderRadius: radius.md, gap: 3, padding: space.md },
  tipLabel: {
    color: palette.herb,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  tipText: { color: palette.ink, fontFamily: fonts.recipeBody, fontSize: 13, lineHeight: 20 },
  warning: { backgroundColor: palette.dangerSoft, borderRadius: radius.md, padding: space.md },
  warningText: {
    color: palette.danger,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  notes: { gap: space.sm },
  note: { color: palette.inkMuted, fontFamily: fonts.recipeBody, fontSize: 14, lineHeight: 22 },
  personalNotes: { gap: space.sm },
  addNote: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 52,
  },
  addNoteText: { color: palette.ember, fontFamily: fonts.sansSemibold, fontSize: 13 },
  notesInput: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 96,
    padding: space.md,
    textAlignVertical: 'top',
  },
  savedLocally: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 11 },
  markCooked: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.lg,
  },
  markCookedComplete: { backgroundColor: palette.herbSoft },
  markCookedText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 13 },
  markCookedTextComplete: { color: palette.herb },
}));
