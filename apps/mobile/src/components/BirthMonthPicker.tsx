import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { AGE_YEARS_MAX, type BirthYearMonth } from '../lib/age';
import { Button } from './Button';
import { SheetContainer } from './SheetContainer';
import { ChevronRightIcon } from './icons';

interface BirthMonthPickerProps {
  value: BirthYearMonth;
  onChange: (value: BirthYearMonth) => void;
}

/**
 * "Doğum ayı ve yılı" field from the QA-corrected design (Child/01). Pure JS —
 * the native surface is frozen, so instead of a platform date picker this is a
 * field that opens a bottom sheet with a year strip and a 12-month grid.
 * Selectable years span the app's 0–12 age domain; future months are excluded.
 */
export function BirthMonthPicker({ value, onChange }: BirthMonthPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const rawMonths = t('common.months', { returnObjects: true });
  const months: string[] = Array.isArray(rawMonths) ? (rawMonths as string[]) : [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const years = Array.from({ length: AGE_YEARS_MAX + 1 }, (_, i) => currentYear - i);

  const fieldLabel = `${months[value.month - 1] ?? value.month} ${value.year}`;

  const selectYear = (year: number) => {
    // Landing on the current year may make the chosen month land in the future.
    const month = year === currentYear ? Math.min(value.month, currentMonth) : value.month;
    onChange({ year, month });
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('childSetup.birthMonthLabel')}: ${fieldLabel}`}
        style={({ pressed }) => [styles.field, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.fieldValue}>{fieldLabel}</Text>
        <View style={styles.chevron}>
          <ChevronRightIcon />
        </View>
      </Pressable>

      <SheetContainer visible={open} onDismiss={() => setOpen(false)}>
        <Text style={styles.sheetTitle}>{t('childSetup.birthMonthLabel')}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.yearRow}
        >
          {years.map((year) => {
            const selected = value.year === year;
            return (
              <Pressable
                key={year}
                onPress={() => selectYear(year)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.yearChip, selected ? styles.chipSelected : styles.chipUnselected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{year}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.monthGrid}>
          {months.map((label, index) => {
            const month = index + 1;
            const disabled = value.year === currentYear && month > currentMonth;
            const selected = value.month === month && !disabled;
            return (
              <Pressable
                key={label}
                onPress={() => onChange({ year: value.year, month })}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                style={[
                  styles.monthChip,
                  selected ? styles.chipSelected : styles.chipUnselected,
                  disabled && styles.chipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                    disabled && styles.chipTextDisabled,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button label={t('common.done')} onPress={() => setOpen(false)} />
      </SheetContainer>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 52,
  },
  fieldValue: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  chevron: { transform: [{ rotate: '90deg' }] },
  sheetTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  yearRow: { flexDirection: 'row', gap: spacing.xs, paddingBottom: spacing.md },
  yearChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.round,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  monthChip: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  chipUnselected: { borderColor: colors.border, backgroundColor: colors.card },
  chipDisabled: { opacity: 0.4 },
  chipText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  chipTextSelected: { color: colors.secondaryForeground, fontFamily: fontFamilies.bodyBold },
  chipTextDisabled: { color: colors.mutedForeground },
});
