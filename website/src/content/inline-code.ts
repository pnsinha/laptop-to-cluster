/**
 * Inline code in plain-text content fields.
 *
 * A front-matter or YAML string that names a command wraps it in backticks:
 * "Run `command -v sbatch` and confirm an account". `inlineCodeHtml` turns
 * each backtick pair into <code> and escapes everything else, so the rest of
 * the string can never inject markup. An unpaired backtick stays as written.
 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (character) => ESCAPES[character]);

export const inlineCodeHtml = (text: string): string => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
