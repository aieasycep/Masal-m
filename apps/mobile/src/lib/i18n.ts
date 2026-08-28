import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { defaultLocale, resources, supportedLocales } from '@masalim/localization';

const deviceLanguage = getLocales()[0]?.languageCode;
const initialLocale = supportedLocales.find((locale) => locale === deviceLanguage) ?? defaultLocale;

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: defaultLocale,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
