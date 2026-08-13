import { describe, expect, it } from 'vitest';
import { possessive, withSuffix } from '../turkish-suffix';

describe('withSuffix — genitive (gen)', () => {
  it.each([
    ['Ege', "Ege'nin"],
    ['Ada', "Ada'nın"],
    ['Aslı', "Aslı'nın"],
    ['Umut', "Umut'un"],
    ['Gül', "Gül'ün"],
    ['Deniz', "Deniz'in"],
    ['Zeynep', "Zeynep'in"],
    ['Utku', "Utku'nun"],
    ['Ömer', "Ömer'in"],
    ['Banu', "Banu'nun"],
  ])('%s → %s', (name, expected) => {
    expect(withSuffix(name, 'gen')).toBe(expected);
  });
});

describe('withSuffix — dative (dat)', () => {
  it.each([
    ['Ege', "Ege'ye"],
    ['Ada', "Ada'ya"],
    ['Umut', "Umut'a"],
    ['Deniz', "Deniz'e"],
    ['Aslı', "Aslı'ya"],
  ])('%s → %s', (name, expected) => {
    expect(withSuffix(name, 'dat')).toBe(expected);
  });
});

describe('withSuffix — accusative (acc)', () => {
  it.each([
    ['Ege', "Ege'yi"],
    ['Ada', "Ada'yı"],
    ['Umut', "Umut'u"],
    ['Gül', "Gül'ü"],
    ['Deniz', "Deniz'i"],
  ])('%s → %s', (name, expected) => {
    expect(withSuffix(name, 'acc')).toBe(expected);
  });
});

describe('withSuffix — locative/ablative', () => {
  it.each([
    ['Ege', 'loc', "Ege'de"],
    ['Umut', 'loc', "Umut'ta"],
    ['Zeynep', 'loc', "Zeynep'te"],
    ['Ada', 'abl', "Ada'dan"],
    ['Umut', 'abl', "Umut'tan"],
  ] as const)('%s %s → %s', (name, suffixCase, expected) => {
    expect(withSuffix(name, suffixCase)).toBe(expected);
  });
});

describe('withSuffix — comitative (com)', () => {
  it.each([
    ['Ege', "Ege'yle"],
    ['Umut', "Umut'la"],
    ['Ada', "Ada'yla"],
  ])('%s → %s', (name, expected) => {
    expect(withSuffix(name, 'com')).toBe(expected);
  });
});

describe('edge cases', () => {
  it('trims whitespace', () => {
    expect(withSuffix('  Ege  ', 'gen')).toBe("Ege'nin");
  });
  it('returns empty string untouched', () => {
    expect(withSuffix('', 'gen')).toBe('');
  });
  it('no written consonant mutation on proper nouns', () => {
    expect(withSuffix('Zeynep', 'gen')).toBe("Zeynep'in");
    expect(withSuffix('Mehmet', 'gen')).toBe("Mehmet'in");
  });
  it('possessive convenience matches gen', () => {
    expect(possessive('Ege')).toBe("Ege'nin");
  });
});
