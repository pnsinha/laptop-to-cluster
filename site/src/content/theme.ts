import type { ThemeChoice } from './contracts';
/** Stored 'light' or 'dark' wins; anything else means System (follow the OS). */
export function storedChoice(value: string | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}
/** Attribute to put on <html data-theme>; null means remove it (follow the OS). */
export function themeAttribute(value: string | null): 'light' | 'dark' | null {
  const choice = storedChoice(value);
  return choice === 'system' ? null : choice;
}
/** Effective scheme for theme-color and tests. */
export function effectiveTheme(value: string | null, prefersDark: boolean): 'light' | 'dark' {
  const attr = themeAttribute(value);
  return attr ?? (prefersDark ? 'dark' : 'light');
}
