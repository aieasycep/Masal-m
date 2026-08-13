import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { Button } from './Button';

interface StateProps {
  emoji: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

/** Empty state per the design: big emoji, Fraunces title, muted body, optional CTA. */
export function EmptyState({ emoji, title, body, ctaLabel, onCta }: StateProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={styles.cta} compact />
      ) : null}
    </View>
  );
}

/** Error state — same layout, friendlier defaults handled by the caller's i18n. */
export function ErrorState({ emoji = '🌧️', title, body, ctaLabel, onCta }: StateProps) {
  return <EmptyState emoji={emoji} title={title} body={body} ctaLabel={ctaLabel} onCta={onCta} />;
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.pageXWide,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  cta: { alignSelf: 'stretch' },
});
