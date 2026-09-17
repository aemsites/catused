import { fetchJson } from './scripts.js';

export const PRODUCTS_INDEX = 'https://main--catused--aemsites.aem.network/products/index.json';
export const HOURS_STEP = 500;
export const PRICE_STEP = 5000;
export const PRICE_CAP_USD = 200000;

/**
 * Loads and caches the products index.
 * @returns {Promise<Array<Object>>}
 */
export async function loadProducts() {
  window.productIndex = window.productIndex || null;
  if (window.productIndex) return window.productIndex;
  if (!window.productIndexPromise) {
    window.productIndexPromise = (async () => {
      try {
        const json = await fetchJson(PRODUCTS_INDEX);
        const data = Array.isArray(json.data) ? json.data : [];
        window.productIndex = data;
        return data;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('failed to load products index', error);
        window.productIndex = [];
        return [];
      }
    })();
  }
  return window.productIndexPromise;
}

/**
 * Loads rough FX rates (units of each currency per 1 USD).
 * @returns {Promise<Object<string, number>>}
 */
export async function loadCurrencyRates() {
  const url = new URL('currencies.json', import.meta.url).href;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return { USD: 1 };
    const json = await resp.json();
    return json.rates || json;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('failed to load currency rates', error);
    return { USD: 1 };
  }
}

/**
 * Converts a listing price to USD using the rate table.
 * @param {Object} item
 * @param {Object<string, number>} rates
 * @returns {number}
 */
export function priceUsd(item, rates) {
  const price = Number(item.price);
  if (Number.isNaN(price) || price < 0) return NaN;
  const currency = String(item.currency || 'USD').toUpperCase();
  const rate = Number(rates[currency]);
  const perUsd = Number.isNaN(rate) || rate <= 0 ? 1 : rate;
  return price / perUsd;
}

/**
 * Filters products by query, ranges, and discrete facets.
 * @param {Array<Object>} products
 * @param {Object} filters
 * @returns {Array<Object>}
 */
export function filterProducts(products, {
  q = '',
  hoursMin = null,
  hoursMax = null,
  priceMin = null,
  priceMax = null,
  yearMin = null,
  yearMax = null,
  category = '',
  brand = '',
  country = '',
  rates = { USD: 1 },
} = {}) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return products.filter((item) => {
    if (terms.length) {
      const haystack = [item.title, item.product_type, item.sku, item.brand]
        .join(' ')
        .toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (category && item.product_type !== category) return false;
    if (brand && item.brand !== brand) return false;
    if (country && item.country !== country) return false;
    const hours = Number(item.hours);
    if (hoursMin != null && (Number.isNaN(hours) || hours < hoursMin)) return false;
    if (hoursMax != null && (Number.isNaN(hours) || hours > hoursMax)) return false;
    const year = Number(item.year);
    if (yearMin != null && (Number.isNaN(year) || year < yearMin)) return false;
    if (yearMax != null && (Number.isNaN(year) || year > yearMax)) return false;
    const price = priceUsd(item, rates);
    if (priceMin != null && (Number.isNaN(price) || price < priceMin)) return false;
    if (priceMax != null && (Number.isNaN(price) || price > priceMax)) return false;
    return true;
  });
}

/**
 * Unique non-empty values from a product field, sorted.
 * @param {Array<Object>} products
 * @param {Function} getValue
 * @returns {string[]}
 */
export function uniqueValues(products, getValue) {
  const seen = new Set();
  const out = [];
  products.forEach((item) => {
    const text = String(getValue(item) ?? '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Sorts a product list. `relevance` keeps the incoming order.
 * @param {Array<Object>} products
 * @param {string} sort
 * @param {Object<string, number>} rates
 * @returns {Array<Object>}
 */
export function sortProducts(products, sort, rates) {
  const copy = [...products];
  if (sort === 'price-asc') {
    copy.sort((a, b) => (priceUsd(a, rates) || 0) - (priceUsd(b, rates) || 0));
  } else if (sort === 'price-desc') {
    copy.sort((a, b) => (priceUsd(b, rates) || 0) - (priceUsd(a, rates) || 0));
  } else if (sort === 'year-desc') {
    copy.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  } else if (sort === 'hours-asc') {
    copy.sort((a, b) => (Number(a.hours) || 0) - (Number(b.hours) || 0));
  }
  return copy;
}

/**
 * Formats a numeric value for display.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Formats a USD price for display.
 * @param {number} value
 * @returns {string}
 */
export function formatPrice(value) {
  return `$${formatNumber(value)}`;
}

/**
 * Parses a typed numeric value.
 * @param {string} raw
 * @returns {number}
 */
export function parseNumber(raw) {
  return Number(String(raw).replace(/[$,+]/g, '').trim());
}

/**
 * Formats a bound, using the over template for the last slider tick.
 * @param {number} value
 * @param {Function} format
 * @param {{ min: number, max: number, lastRegular: number }} domain
 * @param {Object} copy
 * @returns {string}
 */
export function formatBound(value, format, domain, copy) {
  if (value >= domain.max) {
    const template = copy.over || '{value}+';
    return template.replace('{value}', format(domain.lastRegular));
  }
  return format(value);
}

/**
 * Parses a typed bound, treating a trailing + as the over tick.
 * @param {string} raw
 * @param {{ max: number }} domain
 * @returns {number}
 */
export function parseBound(raw, domain) {
  if (String(raw).trim().endsWith('+')) return domain.max;
  return parseNumber(raw);
}

/**
 * Region display name for an ISO country code.
 * @param {string} code
 * @returns {string}
 */
export function formatCountry(code) {
  const value = String(code || '').trim();
  if (!value) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(value) || value;
  } catch {
    return value;
  }
}
