import { i18n } from '@/lib/i18n';

// Locale-aware formatting helpers. They always read the active language so a
// manual language switch is reflected without passing the locale around.
export function getFormatLocale(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

export function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getFormatLocale(), options).format(value);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  return new Intl.RelativeTimeFormat(getFormatLocale(), { numeric: 'auto', ...options }).format(value, unit);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getFormatLocale(), options).format(value);
}

export function formatCurrency(value: number, currency: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getFormatLocale(), { style: 'currency', currency, ...options }).format(value);
}
