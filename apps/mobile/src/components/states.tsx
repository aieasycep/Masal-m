import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { Button } from './Button';

interface StateProps {
  emoji: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  /** `page` (default): full-height treatment; `card`: compact in-content block. */
  variant?: 'page' | 'card';
}

/** Empty state per the design: emoji in a soft circle, Fraunces title, muted body, CTA. */
export function EmptyState({ emoji, title, body, ctaLabel, onCta, variant = 'page' }: StateProps) {
  const card = variant === 'card';
  return (
    <View style={[styles.root, card ? styles.rootCard : null]}>
      <View style={[styles.emojiCircle, card ? styles.emojiCircleCard : null]}>
        <Text style={card ? styles.emojiCard : styles.emoji}>{emoji}</Text>
      </View>
      <Text style={[styles.title, card ? styles.titleCard : null]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={styles.cta} compact />
      ) : null}
    </View>
  );
}

/** Error kinds from the final design (`State/Error` variants). */
export type ErrorKind = 'network' | 'server' | 'generation' | 'payment' | 'voice' | 'illustration';

const ERROR_EMOJI: Record<ErrorKind, string> = {
  network: '📡',
  server: '⚡',
  generation: '✨',
  payment: '💳',
  voice: '🎙',
  illustration: '🎨',
};

interface ErrorStateProps extends Partial<StateProps> {
  kind?: ErrorKind;
  onRetry?: () => void;
}

/**
 * Error state — pass `kind` for the design's per-domain copy defaults
 * (i18n `states.error.<kind>.*`), or override title/body/emoji directly.
 */
export function ErrorState({ kind, emoji, title, body, ctaLabel, onCta, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  const resolvedEmoji = emoji ?? (kind ? ERROR_EMOJI[kind] : '🌧️');
  const resolvedTitle = title ?? (kind ? t(`states.error.${kind}.title`) : t('errors.GENERIC'));
  const resolvedBody = body ?? (kind ? t(`states.error.${kind}.body`) : undefined);
  const retry = onCta ?? onRetry;
  return (
    <EmptyState
      emoji={resolvedEmoji}
      title={resolvedTitle}
      body={resolvedBody}
      ctaLabel={retry ? (ctaLabel ?? t('common.retry')) : undefined}
      onCta={retry}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.pageXWide,
  },
  rootCard: { paddingVertical: spacing.xxl, paddingHorizontal: spacing.pageX },
  emojiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emojiCircleCard: { width: 64, height: 64, borderRadius: 32, marginBottom: 12 },
  emoji: { fontSize: 40 },
  emojiCard: { fontSize: 32 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 8,
  },
  titleCard: { fontSize: fontSizes.h4 },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    maxWidth: 280,
  },
  cta: { alignSelf: 'stretch' },
});
