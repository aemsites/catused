import { fetchJson } from './product-fetch.js';
import {
  HOURS_CAP,
  HOURS_STEP,
  PRICE_CAP_USD,
  PRICE_STEP,
  PRODUCTS_INDEX,
  YEAR_MAX,
  YEAR_MIN,
  YEAR_STEP,
  hasProductImage,
  priceUsd,
} from './product-catalog.js';

export {
  HOURS_CAP,
  HOURS_STEP,
  PRICE_CAP_USD,
  PRICE_STEP,
  PRODUCTS_INDEX,
  YEAR_MAX,
  YEAR_MIN,
  YEAR_STEP,
  hasProductImage,
  priceUsd,
};

export const CATEGORIES_SHEET = new URL('/categories.json', PRODUCTS_INDEX).href;

const handlers = new Map();
let watchSeq = 0;
let catalogWorker = null;

/**
 * @param {Object} spec
 * @returns {Object}
 */
function cloneSpec(spec) {
  const out = { ...(spec || {}) };
  if (spec?.categoryScope instanceof Set) out.categoryScope = [...spec.categoryScope];
  return out;
}

/**
 * @returns {string}
 */
function workerUrl() {
  const base = (window.hlx && window.hlx.codeBasePath) || '';
  return new URL(`${base}/scripts/product-index-worker.js`, window.location.href).href;
}

/**
 * @returns {Worker}
 */
function ensureWorker() {
  if (catalogWorker) return catalogWorker;
  catalogWorker = new Worker(workerUrl(), { type: 'module' });
  catalogWorker.addEventListener('message', (event) => {
    const { data } = event;
    if (!data || data.type !== 'result') return;
    const handler = handlers.get(data.name);
    if (handler) handler(data);
  });
  catalogWorker.addEventListener('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('product catalog worker failed', error);
  });
  catalogWorker.postMessage({ type: 'start', hostname: window.location.hostname });
  return catalogWorker;
}

/**
 * @param {Object} payload
 */
function send(payload) {
  ensureWorker().postMessage({ ...payload, hostname: window.location.hostname });
}

/**
 * Watches the catalog worker. `onResult` receives page/facets/histograms or
 * suggestion groups. The catalog stays in the worker.
 * @param {Object} spec
 * @param {Function} onResult
 * @returns {{ update: Function, stop: Function }}
 */
export function watchCatalog(spec, onResult) {
  const name = `w${watchSeq += 1}`;
  handlers.set(name, onResult);
  send({ type: 'watch', name, spec: cloneSpec(spec) });
  return {
    update(next) {
      send({ type: 'watch', name, spec: cloneSpec(next) });
    },
    stop() {
      handlers.delete(name);
      send({ type: 'unwatch', name });
    },
  };
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
 * Loads the category tree used to scope PLP listings by pathname.
 * Only needed on `/categories/…` pages. Prefers same-origin `/categories.json`.
 * @returns {Promise<Array<{ path: string, title: string }>>}
 */
export async function loadCategories() {
  if (Array.isArray(window.categoryIndex)) return window.categoryIndex;
  if (!window.categoryIndexPromise) {
    window.categoryIndexPromise = (async () => {
      try {
        const local = `${window.location.origin}/categories.json`;
        let json;
        try {
          const resp = await fetch(local);
          if (resp.ok) json = await resp.json();
        } catch {
          json = null;
        }
        if (!json) json = await fetchJson(CATEGORIES_SHEET);
        window.categoryIndex = Array.isArray(json.data) ? json.data : [];
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('failed to load categories', error);
        window.categoryIndex = [];
      }
      return window.categoryIndex;
    })();
  }
  return window.categoryIndexPromise;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizePath(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Path after the `/categories/` prefix, if present.
 * @param {string} pathname
 * @returns {string}
 */
function categoryRemainder(pathname) {
  const page = normalizePath(pathname);
  const prefix = 'categories/';
  const at = page.indexOf(prefix);
  if (at === -1) return '';
  return page.slice(at + prefix.length);
}

/**
 * True when the page URL is a category listing (`/categories/…`).
 * @param {string} [pathname]
 * @returns {boolean}
 */
export function isCategoryListing(pathname = window.location.pathname) {
  return Boolean(categoryRemainder(pathname));
}

/**
 * @param {Set<string>} keys
 * @param {string} value
 */
function addScopeKey(keys, value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return;
  keys.add(text);
  keys.add(slugify(text));
  keys.add(text.replace(/-/g, ' '));
}

/**
 * Longest category path covered by the page URL after `/categories/`.
 * @param {string} pathname
 * @param {Array<{ path: string, title: string }>} categories
 * @returns {{ path: string, title: string }|null}
 */
export function matchCategoryPath(pathname, categories) {
  const remainder = categoryRemainder(pathname);
  if (!remainder || !categories?.length) return null;
  let best = null;
  let bestLen = -1;
  categories.forEach((category) => {
    const path = normalizePath(category.path);
    if (!path) return;
    if (remainder === path || remainder.startsWith(`${path}/`)) {
      if (path.length > bestLen) {
        best = category;
        bestLen = path.length;
      }
    }
  });
  return best;
}

/**
 * Titles and slugs for the matched category and its descendants.
 * Returns null when the URL is not under `/categories/`.
 * @param {string} pathname
 * @param {Array<{ path: string, title: string }>} categories
 * @returns {Set<string>|null}
 */
export function impliedCategoryScope(pathname, categories) {
  const remainder = categoryRemainder(pathname);
  if (!remainder) return null;

  const matched = matchCategoryPath(pathname, categories);
  const prefix = normalizePath(matched?.path || remainder);
  const keys = new Set();
  addScopeKey(keys, remainder);
  remainder.split('/').forEach((part) => addScopeKey(keys, part));

  (categories || []).forEach((category) => {
    const path = normalizePath(category.path);
    if (path !== prefix && !path.startsWith(`${prefix}/`)) return;
    addScopeKey(keys, category.title);
    addScopeKey(keys, path);
    addScopeKey(keys, path.split('/').pop());
  });
  return keys;
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
