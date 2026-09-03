import { Fragment, type ReactNode, useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

interface KaraokeTextProps {
  text: string;
  /** Page-local index (whitespace tokens, `/\S+/g`) of the word being read — null = none. */
  activeIndex: number | null;
  /** Words at or before the active one are "read" (dimmed differently from unread). */
  style?: StyleProp<TextStyle>;
  activeStyle?: StyleProp<TextStyle>;
  readStyle?: StyleProp<TextStyle>;
  /** Tap a word to jump playback to it. */
  onWordPress?: (index: number) => void;
}

interface Token {
  text: string;
  /** Word index for non-whitespace tokens; null for whitespace runs. */
  index: number | null;
}

/** Same tokenization as the server's word timeline: `/\S+/g` words, whitespace kept verbatim. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  for (const part of text.split(/(\s+)/)) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      tokens.push({ text: part, index: null });
    } else {
      tokens.push({ text: part, index });
      index += 1;
    }
  }
  return tokens;
}

/**
 * Karaoke rendering of one page: the word under the playhead is highlighted
 * (design: amber #FFD27D), words already read keep a "linen" tone, unread
 * ones stay dimmer; tapping a word seeks to it. Falls back to plain text
 * when there is no active word.
 */
export function KaraokeText({
  text,
  activeIndex,
  style,
  activeStyle,
  readStyle,
  onWordPress,
}: KaraokeTextProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  if (activeIndex == null) {
    return <Text style={style}>{text}</Text>;
  }
  const spans: ReactNode[] = tokens.map((token, position) => {
    if (token.index == null) return <Fragment key={position}>{token.text}</Fragment>;
    const wordIndex = token.index;
    const isActive = wordIndex === activeIndex;
    const isRead = wordIndex < activeIndex;
    return (
      <Text
        key={position}
        style={isActive ? activeStyle : isRead ? readStyle : undefined}
        onPress={onWordPress != null ? () => onWordPress(wordIndex) : undefined}
        suppressHighlighting
      >
        {token.text}
      </Text>
    );
  });
  return <Text style={style}>{spans}</Text>;
}
