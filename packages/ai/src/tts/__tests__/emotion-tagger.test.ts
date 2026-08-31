import { describe, expect, it } from 'vitest';
import { applyDirectorOutput, stripAudioTags, tagsPreserveText } from '../emotion-tagger';

const ORIGINAL = 'Ege gökyüzüne baktı. "Yıldızlar ne kadar parlak!" dedi ve gülümsedi.';
const TAGGED = '[curious] Ege gökyüzüne baktı. [excited] "Yıldızlar ne kadar parlak!" dedi ve [warmly] gülümsedi.';

describe('stripAudioTags', () => {
  it('removes bracketed tags and keeps the words', () => {
    expect(stripAudioTags('[whispers] İyi geceler [softly] küçük yıldız.')).toBe(
      ' İyi geceler  küçük yıldız.',
    );
  });

  it('leaves text without tags untouched', () => {
    expect(stripAudioTags(ORIGINAL)).toBe(ORIGINAL);
  });
});

describe('tagsPreserveText', () => {
  it('accepts pure tag insertion', () => {
    expect(tagsPreserveText(ORIGINAL, TAGGED)).toBe(true);
  });

  it('rejects rewritten or truncated story text', () => {
    expect(tagsPreserveText(ORIGINAL, '[excited] Ege denize baktı.')).toBe(false);
    expect(tagsPreserveText(ORIGINAL, '[curious] Ege gökyüzüne baktı.')).toBe(false);
  });
});

describe('applyDirectorOutput', () => {
  it('keeps a valid tagged reply', () => {
    expect(applyDirectorOutput(ORIGINAL, `\n${TAGGED}\n`)).toBe(TAGGED);
  });

  it('falls back to the original on rewrite, empty, or over-length replies', () => {
    expect(applyDirectorOutput(ORIGINAL, 'Bambaşka bir hikâye anlatayım.')).toBe(ORIGINAL);
    expect(applyDirectorOutput(ORIGINAL, '   ')).toBe(ORIGINAL);
    expect(applyDirectorOutput(ORIGINAL, `${'[softly] '.repeat(400)}${ORIGINAL}`)).toBe(ORIGINAL);
  });
});
