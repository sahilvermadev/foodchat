import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type {
  AddShoppingItemInput,
  ShoppingCategory,
  ShoppingListItem,
  UpdateShoppingItemRequest,
} from 'librechat-data-provider';
import { shoppingCategory } from 'librechat-data-provider/mobile';

import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/features/theme/provider';
import { createThemeStyles } from '@/features/theme/styles';
import { useTranslation } from '@/lib/i18n';
import { shoppingRequiredAmount } from './format';

const categories: ShoppingCategory[] = [
  'produce',
  'bakery',
  'dairy',
  'meat_seafood',
  'pantry',
  'frozen',
  'beverages',
  'household',
  'other',
];

export function ShoppingItemEditor({
  item,
  onClose,
  onSave,
  visible,
}: {
  item?: ShoppingListItem;
  onClose(): void;
  onSave(input: AddShoppingItemInput | UpdateShoppingItemRequest): void;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const [name, setName] = useState('');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<ShoppingCategory>('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [pantry, setPantry] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(item?.displayName ?? '');
    setPurchaseQuantity(item?.purchaseQuantity ?? '');
    setNote(item?.note ?? '');
    setCategory(item?.category ?? 'other');
    setCategoryTouched(item?.categoryOverride ?? false);
    setPantry(item?.pantry ?? false);
  }, [item, visible]);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      displayName: name.trim(),
      purchaseQuantity: purchaseQuantity.trim() || undefined,
      note: note.trim() || undefined,
      category,
      categoryOverride: categoryTouched,
      pantry,
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.root}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={t('shopping.closeEditor')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.iconButton}
            >
              <SymbolView
                name={{ android: 'close', ios: 'xmark' }}
                size={20}
                tintColor={colors.ink}
              />
            </Pressable>
            <Text style={styles.title}>{t(item ? 'shopping.editItem' : 'shopping.addItem')}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={!name.trim()}
              onPress={save}
              style={[styles.saveButton, !name.trim() && styles.disabled]}
            >
              <Text style={styles.saveText}>{t('shopping.save')}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={styles.label}>{t('shopping.itemName')}</Text>
              <TextInput
                autoCapitalize="sentences"
                autoFocus
                onChangeText={(value) => {
                  setName(value);
                  if (!categoryTouched) setCategory(shoppingCategory(value));
                }}
                placeholder={t('shopping.itemNamePlaceholder')}
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={name}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('shopping.purchaseQuantity')}</Text>
              <TextInput
                onChangeText={setPurchaseQuantity}
                placeholder={t('shopping.purchaseQuantityPlaceholder')}
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
                value={purchaseQuantity}
              />
              <Text style={styles.help}>{t('shopping.purchaseQuantityHelp')}</Text>
              {item && shoppingRequiredAmount(item) ? (
                <Text style={styles.required}>
                  {t('shopping.recipesRequire', { amount: shoppingRequiredAmount(item) })}
                </Text>
              ) : null}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('shopping.category')}</Text>
              <View style={styles.categories}>
                {categories.map((value) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === value }}
                    key={value}
                    onPress={() => {
                      setCategory(value);
                      setCategoryTouched(true);
                    }}
                    style={[styles.category, category === value && styles.categorySelected]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        category === value && styles.categoryTextSelected,
                      ]}
                    >
                      {t(`shopping.category.${value}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{t('shopping.inPantry')}</Text>
                <Text style={styles.help}>{t('shopping.inPantryHelp')}</Text>
              </View>
              <Switch
                accessibilityLabel={t('shopping.inPantry')}
                onValueChange={setPantry}
                thumbColor={pantry ? colors.white : colors.canvasRaised}
                trackColor={{ false: colors.line, true: colors.herb }}
                value={pantry}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t('shopping.note')}</Text>
              <TextInput
                multiline
                onChangeText={setNote}
                placeholder={t('shopping.notePlaceholder')}
                placeholderTextColor={colors.inkMuted}
                style={[styles.input, styles.noteInput]}
                textAlignVertical="top"
                value={note}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = createThemeStyles((palette) => ({
  root: { backgroundColor: palette.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: space.lg,
  },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  title: { color: palette.ink, fontFamily: fonts.recipeHeading, fontSize: 21 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: palette.ember,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 70,
    paddingHorizontal: space.md,
  },
  saveText: { color: palette.white, fontFamily: fonts.sansSemibold, fontSize: 13 },
  disabled: { opacity: 0.4 },
  content: { gap: space.xl, padding: space.xl },
  field: { gap: space.sm },
  label: {
    color: palette.inkMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: palette.canvasRaised,
    borderColor: palette.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  noteInput: { minHeight: 110 },
  help: { color: palette.inkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 },
  required: { color: palette.ember, fontFamily: fonts.sansMedium, fontSize: 12 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  category: {
    borderColor: palette.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  categorySelected: { backgroundColor: palette.softClay, borderColor: palette.ember },
  categoryText: { color: palette.inkMuted, fontFamily: fonts.sansMedium, fontSize: 12 },
  categoryTextSelected: { color: palette.ember, fontFamily: fonts.sansSemibold },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderTopColor: palette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: space.lg,
    justifyContent: 'space-between',
    paddingVertical: space.lg,
  },
  toggleCopy: { flex: 1, gap: space.xs },
  toggleTitle: { color: palette.ink, fontFamily: fonts.sansSemibold, fontSize: 15 },
}));
