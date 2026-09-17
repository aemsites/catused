import { fetchJson } from './scripts.js';

export const PRODUCTS_INDEX = 'https://main--catused--aemsites.aem.network/products/index.json';
export const HOURS_STEP = 500;
export const HOURS_CAP = 10000;
export const PRICE_STEP = 10000;
export const PRICE_CAP_USD = 400000;
export const YEAR_STEP = 1;
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2026;
const INDEX_PAGE_SIZE = 1000;
const INDEX_CONCURRENCY = 5;
const productListeners = new Set();
let firstPagePromise;

/**
 * Whether a product has a usable image URL.
 * @param {Object} item
 * @returns {boolean}
 */
export function hasProductImage(item) {
  const src = String(item?.image || '').trim();
  return src.startsWith('http') || src.startsWith('/') || src.startsWith('.');
}

/**
 * Subscribe to product-index updates as pages arrive.
 * @param {Function} listener
 * @returns {Function} unsubscribe
 */
export function subscribeProducts(listener) {
  productListeners.add(listener);
  return () => productListeners.delete(listener);
}

/**
 * @param {number} offset
 * @returns {string}
 */
function indexPageUrl(offset) {
  const url = new URL(PRODUCTS_INDEX);
  url.searchParams.set('limit', String(INDEX_PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url.href;
}

/**
 * @param {Array<Object>} items
 */
function sortByImage(items) {
  items.sort((a, b) => Number(hasProductImage(b)) - Number(hasProductImage(a)));
}

function notifyProductListeners() {
  productListeners.forEach((listener) => listener(window.productIndex));
}

/**
 * @param {number} offset
 * @returns {Promise<{ offset: number, chunk: Array<Object>, total: number }>}
 */
async function fetchIndexPage(offset) {
  const json = await fetchJson(indexPageUrl(offset));
  return {
    offset,
    chunk: Array.isArray(json.data) ? json.data : [],
    total: Number(json.total),
  };
}

/**
 * @param {{ offset: number, chunk: Array<Object> }} page
 */
function applyIndexPage(page) {
  if (!page.chunk.length) return;
  window.productIndex.push(...page.chunk);
  sortByImage(window.productIndex);
  notifyProductListeners();
}

/**
 * Loads the products index in pages of 1000 with five fetches in flight.
 * Resolves after the first page so widgets can render, then keeps appending.
 * @returns {Promise<Array<Object>>}
 */
export async function loadProducts() {
  if (!Array.isArray(window.productIndex)) window.productIndex = [];
  if (window.productIndexComplete) return window.productIndex;

  if (!window.productIndexPromise) {
    let firstPageDone;
    firstPagePromise = new Promise((resolve) => {
      firstPageDone = resolve;
    });

    window.productIndexPromise = (async () => {
      let nextOffset = 0;
      let total = Infinity;

      const worker = async () => {
        while (nextOffset < total) {
          const offset = nextOffset;
          nextOffset += INDEX_PAGE_SIZE;
          // Sliding window: each worker starts the next page as soon as it is free.
          // eslint-disable-next-line no-await-in-loop
          const page = await fetchIndexPage(offset);
          if (Number.isFinite(page.total) && page.total >= 0) {
            total = Math.min(total, page.total);
          }
          if (!page.chunk.length || page.chunk.length < INDEX_PAGE_SIZE) {
            total = Math.min(total, offset + page.chunk.length);
          }
          if (offset < total) applyIndexPage(page);
          if (offset === 0) firstPageDone();
        }
      };

      const workers = Array.from({ length: INDEX_CONCURRENCY }, worker);
      try {
        await Promise.all(workers);
      } catch (error) {
        total = 0;
        await Promise.allSettled(workers);
        // eslint-disable-next-line no-console
        console.error('failed to load products index', error);
      }
      window.productIndexComplete = true;
      notifyProductListeners();
      firstPageDone();
      return window.productIndex;
    })();
  }

  await firstPagePromise;
  return window.productIndex;
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
 * Formats a year without grouping separators.
 * @param {number} value
 * @returns {string}
 */
export function formatYear(value) {
  return String(Math.round(value));
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
  if (domain.over !== false && value >= domain.max) {
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

export const PLP_PARAM_KEYS = [
  'q', 'category', 'brand', 'country', 'sort', 'page',
  'hoursMin', 'hoursMax', 'priceMin', 'priceMax', 'yearMin', 'yearMax',
];

/**
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
function toNumberParam(raw) {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

/**
 * Reads PLP filters from a query string.
 * @param {string} [search]
 * @returns {Object}
 */
export function readPlpParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    q: params.get('q') || '',
    category: params.get('category') || '',
    brand: params.get('brand') || '',
    country: params.get('country') || '',
    sort: params.get('sort') || 'relevance',
    page: Math.max(1, toNumberParam(params.get('page')) || 1),
    hoursMin: toNumberParam(params.get('hoursMin')),
    hoursMax: toNumberParam(params.get('hoursMax')),
    priceMin: toNumberParam(params.get('priceMin')),
    priceMax: toNumberParam(params.get('priceMax')),
    yearMin: toNumberParam(params.get('yearMin')),
    yearMax: toNumberParam(params.get('yearMax')),
  };
}

/**
 * Writes PLP filter keys onto a URLSearchParams instance.
 * @param {URLSearchParams} params
 * @param {Object} state
 * @returns {URLSearchParams}
 */
export function applyPlpParams(params, state) {
  PLP_PARAM_KEYS.forEach((key) => params.delete(key));
  const set = (key, value) => {
    if (value != null && value !== '') params.set(key, String(value));
  };
  set('q', state.q);
  set('category', state.category);
  set('brand', state.brand);
  set('country', state.country);
  if (state.sort && state.sort !== 'relevance') set('sort', state.sort);
  if (state.page > 1) set('page', state.page);
  set('hoursMin', state.hoursMin);
  set('hoursMax', state.hoursMax);
  set('priceMin', state.priceMin);
  set('priceMax', state.priceMax);
  set('yearMin', state.yearMin);
  set('yearMax', state.yearMax);
  return params;
}

/**
 * Builds a PLP URL from filter state.
 * @param {string} pathname
 * @param {Object} state
 * @returns {string}
 */
export function plpSearchUrl(pathname, state) {
  const query = applyPlpParams(new URLSearchParams(), state).toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}
