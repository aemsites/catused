/**
 * Region and currency preference. Rates are units of currency per 1 USD.
 */

const STORAGE_KEY = 'catused-locale';

/** Pairs a market with the currency used there. */
export const LOCALES = [
  { region: 'United States', currency: 'USD' },
  { region: 'Canada', currency: 'CAD' },
  { region: 'Europe', currency: 'EUR' },
  { region: 'United Kingdom', currency: 'GBP' },
  { region: 'Australia', currency: 'AUD' },
  { region: 'Singapore', currency: 'SGD' },
  { region: 'Japan', currency: 'JPY' },
  { region: 'Poland', currency: 'PLN' },
  { region: 'Indonesia', currency: 'IDR' },
];

const DEFAULT_LOCALE = LOCALES[0];

/**
 * @param {object} locale
 * @returns {string}
 */
export function localeLabel(locale) {
  return `${locale.region} (${locale.currency})`;
}

/**
 * @returns {{ region: string, currency: string }}
 */
export function readLocale() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    const match = LOCALES.find((locale) => (
      locale.region === saved.region && locale.currency === saved.currency
    ));
    return match || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * @param {{ region: string, currency: string }} locale
 */
export function writeLocale(locale) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    region: locale.region,
    currency: locale.currency,
  }));
}

/**
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
function formatMoney(amount, currency) {
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

/**
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {Object<string, number>} rates
 * @returns {number}
 */
export function convertAmount(amount, fromCurrency, toCurrency, rates) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return NaN;
  const from = String(fromCurrency || 'USD').toUpperCase();
  const to = String(toCurrency || 'USD').toUpperCase();
  if (from === to) return value;
  const fromRate = Number(rates?.[from]);
  const toRate = Number(rates?.[to]);
  const perUsdFrom = Number.isFinite(fromRate) && fromRate > 0 ? fromRate : 1;
  const perUsdTo = Number.isFinite(toRate) && toRate > 0 ? toRate : 1;
  return (value / perUsdFrom) * perUsdTo;
}

/**
 * Formats a price for display. USD keeps the source currency. Any other
 * preference converts the amount into that currency.
 * @param {number} amount
 * @param {string} [sourceCurrency]
 * @param {Object<string, number>} [rates]
 * @returns {string}
 */
export function formatListingPrice(amount, sourceCurrency = 'USD', rates = { USD: 1 }) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const source = String(sourceCurrency || 'USD').toUpperCase();
  const preferred = readLocale().currency;
  if (preferred === 'USD') return formatMoney(value, source);
  const converted = convertAmount(value, source, preferred, rates);
  if (!Number.isFinite(converted)) return formatMoney(value, source);
  return formatMoney(converted, preferred);
}
