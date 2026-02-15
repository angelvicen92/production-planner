import i18n from "./index";

export async function setLanguage(language: string) {
  await i18n.changeLanguage(language);
}

export function getCurrentLanguage() {
  return i18n.language;
}
