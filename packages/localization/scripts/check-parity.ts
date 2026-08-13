/* eslint-disable no-console */
import tr from '../src/locales/tr.json';
import en from '../src/locales/en.json';

type Tree = { [key: string]: string | string[] | Tree };

function collectKeys(obj: Tree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Tree, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const trKeys = new Set(collectKeys(tr as Tree));
const enKeys = new Set(collectKeys(en as Tree));

const missingInEn = [...trKeys].filter((k) => !enKeys.has(k));
const missingInTr = [...enKeys].filter((k) => !trKeys.has(k));

if (missingInEn.length > 0 || missingInTr.length > 0) {
  if (missingInEn.length > 0) {
    console.error(`Keys missing in en.json (${missingInEn.length}):`);
    for (const k of missingInEn) console.error(`  - ${k}`);
  }
  if (missingInTr.length > 0) {
    console.error(`Keys missing in tr.json (${missingInTr.length}):`);
    for (const k of missingInTr) console.error(`  - ${k}`);
  }
  process.exit(1);
}

console.log(`i18n parity OK — ${trKeys.size} keys in both locales`);
