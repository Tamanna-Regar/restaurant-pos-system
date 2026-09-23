import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import hiTranslation from './locales/hi.json';

const resources = {
  en: { translation: enTranslation },
  hi: { translation: hiTranslation }
};

const savedLanguage = localStorage.getItem('tamanna_pos_lang') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export const changeLanguage = (lng) => {
  i18n.changeLanguage(lng);
  localStorage.setItem('tamanna_pos_lang', lng);
};

export default i18n;

