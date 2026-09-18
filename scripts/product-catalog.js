export const PRODUCTS_INDEX = 'https://main--catused--aemsites.aem.network/products/index.json';
export const HOURS_STEP = 500;
export const HOURS_CAP = 10000;
export const PRICE_STEP = 10000;
export const PRICE_CAP_USD = 400000;
export const YEAR_STEP = 1;
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2026;
export const INDEX_PAGE_SIZE = 1000;
export const INDEX_CONCURRENCY = 5;
export const SUGGESTIONS_LIMIT = 24;
export const SUGGESTIONS_UNIQUE_LIMIT = 40;

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
 * @param {Array<Object>} items
 */
export function sortByImage(items) {
  items.sort((a, b) => Number(hasProductImage(b)) - Number(hasProductImage(a)));
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
 * @param {Set<string>|Array<string>|null|undefined} value
 * @returns {Set<string>|null}
 */
function asScope(value) {
  if (value instanceof Set) return value;
  if (value && value.length) return new Set(value);
  return null;
}

/**
 * @param {Object} item
 * @param {Set<string>|null} scope
 * @returns {boolean}
 */
function inCategoryScope(item, scope) {
  if (!scope) return true;
  const type = String(item.product_type || '').trim();
  if (!type) return false;
  return scope.has(type.toLowerCase()) || scope.has(slugify(type));
}

/**
 * @param {Object} item
 * @param {Object} filters
 * @param {string} [skip]
 * @returns {boolean}
 */
export function productPasses(item, filters, skip = '') {
  const {
    terms = [],
    hoursMin = null,
    hoursMax = null,
    priceMin = null,
    priceMax = null,
    yearMin = null,
    yearMax = null,
    category = '',
    brand = '',
    country = '',
    categoryScope = null,
    rates = { USD: 1 },
  } = filters;

  if (skip !== 'scope' && !inCategoryScope(item, categoryScope)) return false;
  if (skip !== 'q' && terms.length) {
    const haystack = [item.title, item.product_type, item.sku, item.brand]
      .join(' ')
      .toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return false;
  }
  if (skip !== 'category' && category && item.product_type !== category) return false;
  if (skip !== 'brand' && brand && item.brand !== brand) return false;
  if (skip !== 'country' && country && item.country !== country) return false;
  if (skip !== 'hours') {
    const hours = Number(item.hours);
    if (hoursMin != null && (Number.isNaN(hours) || hours < hoursMin)) return false;
    if (hoursMax != null && (Number.isNaN(hours) || hours > hoursMax)) return false;
  }
  if (skip !== 'year') {
    const year = Number(item.year);
    if (yearMin != null && (Number.isNaN(year) || year < yearMin)) return false;
    if (yearMax != null && (Number.isNaN(year) || year > yearMax)) return false;
  }
  if (skip !== 'price') {
    const price = priceUsd(item, rates);
    if (priceMin != null && (Number.isNaN(price) || price < priceMin)) return false;
    if (priceMax != null && (Number.isNaN(price) || price > priceMax)) return false;
  }
  return true;
}

/**
 * Filters products by query, ranges, and discrete facets.
 * @param {Array<Object>} products
 * @param {Object} filters
 * @returns {Array<Object>}
 */
export function filterProducts(products, filters = {}) {
  const terms = String(filters.q || '').trim().toLowerCase().split(/\s+/)
    .filter(Boolean);
  const categoryScope = asScope(filters.categoryScope);
  const prepared = { ...filters, terms, categoryScope };
  return products.filter((item) => productPasses(item, prepared));
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
 * Unique non-empty values with match counts, highest first.
 * @param {Array<Object>} products
 * @param {Function} getValue
 * @returns {Array<{ value: string, count: number }>}
 */
export function facetCounts(products, getValue) {
  const counts = new Map();
  products.forEach((item) => {
    const text = String(getValue(item) ?? '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { value: text, count: 1 });
  });
  return [...counts.values()].sort((a, b) => (
    b.count - a.count || a.value.localeCompare(b.value, 'en', { numeric: true })
  ));
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
 * Numeric values from products via an accessor.
 * @param {Array<Object>} products
 * @param {Function} getValue
 * @returns {number[]}
 */
export function numericValues(products, getValue) {
  return products
    .map((item) => Number(getValue(item)))
    .filter((value) => !Number.isNaN(value) && value >= 0);
}

/**
 * Largest number in a list without spreading.
 * @param {number[]} values
 * @param {number} [fallback]
 * @returns {number}
 */
export function maxOf(values, fallback = 0) {
  let max = fallback;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

/**
 * Slider/histogram domain: 0 to lastRegular, plus one over tick.
 * @param {number[]} values
 * @param {number} step
 * @param {number} [cap]
 * @param {number} [origin]
 * @param {boolean} [over]
 * @returns {{ min: number, max: number, lastRegular: number, over: boolean }}
 */
export function valueDomain(values, step, cap, origin = 0, over = true) {
  const start = origin || 0;
  let lastRegular;
  if (cap != null) {
    lastRegular = Math.max(start, Math.round(cap / step) * step);
  } else {
    const dataMax = maxOf(values, start);
    lastRegular = Math.max(start + step, Math.floor(dataMax / step) * step);
  }
  return {
    min: start,
    lastRegular,
    max: over ? lastRegular + step : lastRegular,
    over,
  };
}

/**
 * Builds histogram bins in step-sized buckets.
 * @param {number[]} values
 * @param {{ min: number, max: number, lastRegular: number, over: boolean }} domain
 * @param {number} step
 * @returns {Array<{ start: number, end: number, over: boolean, ratio: number }>}
 */
export function buildHistogram(values, domain, step) {
  const {
    min, max, lastRegular, over: hasOver,
  } = domain;
  const bins = Math.max(1, hasOver === false
    ? Math.round((lastRegular - min) / step) + 1
    : Math.round((max - min) / step));
  const counts = Array(bins).fill(0);
  values.forEach((value) => {
    let index = hasOver !== false && value >= lastRegular
      ? bins - 1
      : Math.floor((value - min) / step);
    if (index >= bins) index = bins - 1;
    if (index < 0) index = 0;
    counts[index] += 1;
  });
  const peak = Math.max(1, maxOf(counts, 0));
  return counts.map((count, index) => {
    const start = min + index * step;
    const unbounded = hasOver !== false && index === bins - 1;
    return {
      start,
      end: unbounded ? null : start + step,
      over: unbounded,
      ratio: count / peak,
    };
  });
}

/**
 * @param {string} kind
 * @param {number[]} values
 * @returns {Array<{ start: number, end: number, over: boolean, ratio: number }>}
 */
export function histogramFor(kind, values) {
  if (kind === 'hours') {
    return buildHistogram(values, valueDomain(values, HOURS_STEP, HOURS_CAP, 0, true), HOURS_STEP);
  }
  if (kind === 'price') {
    return buildHistogram(
      values,
      valueDomain(values, PRICE_STEP, PRICE_CAP_USD, 0, true),
      PRICE_STEP,
    );
  }
  return buildHistogram(
    values,
    valueDomain(values, YEAR_STEP, YEAR_MAX, YEAR_MIN, false),
    YEAR_STEP,
  );
}

/**
 * @param {Map<string, { value: string, count: number }>} counts
 * @param {string|null|undefined} raw
 */
function addCount(counts, raw) {
  const text = String(raw ?? '').trim();
  if (!text) return;
  const key = text.toLowerCase();
  const current = counts.get(key);
  if (current) current.count += 1;
  else counts.set(key, { value: text, count: 1 });
}

/**
 * @param {Map<string, { value: string, count: number }>} counts
 * @returns {Array<{ value: string, count: number }>}
 */
function sortedCounts(counts) {
  return [...counts.values()].sort((a, b) => (
    b.count - a.count || a.value.localeCompare(b.value, 'en', { numeric: true })
  ));
}

/**
 * One-pass query: page of matches plus optional facets and histograms.
 * @param {Array<Object>} products
 * @param {Object} spec
 * @returns {Object}
 */
export function queryProducts(products, spec = {}) {
  const terms = String(spec.q || '').trim().toLowerCase().split(/\s+/)
    .filter(Boolean);
  const categoryScope = asScope(spec.categoryScope);
  const rates = spec.rates || { USD: 1 };
  const filters = {
    ...spec, terms, categoryScope, rates,
  };
  const pageSize = spec.pageSize == null ? 50 : spec.pageSize;
  const needItems = pageSize > 0;
  const wantFacets = !!spec.facets;
  const histograms = spec.histograms || [];
  const wantHours = histograms.includes('hours');
  const wantPrice = histograms.includes('price');
  const wantYear = histograms.includes('year');

  const matches = [];
  let count = 0;
  const categoryCounts = new Map();
  const brandCounts = new Map();
  const countryCounts = new Map();
  const hoursValues = [];
  const priceValues = [];
  const yearValues = [];

  for (let i = 0; i < products.length; i += 1) {
    const item = products[i];
    if (productPasses(item, filters)) {
      count += 1;
      if (needItems) matches.push(item);
    }
    if (wantFacets) {
      if (productPasses(item, filters, 'category')) addCount(categoryCounts, item.product_type);
      if (productPasses(item, filters, 'brand')) addCount(brandCounts, item.brand);
      if (productPasses(item, filters, 'country')) addCount(countryCounts, item.country);
    }
    if (wantHours && productPasses(item, filters, 'hours')) {
      const hours = Number(item.hours);
      if (!Number.isNaN(hours) && hours >= 0) hoursValues.push(hours);
    }
    if (wantPrice && productPasses(item, filters, 'price')) {
      const price = priceUsd(item, rates);
      if (!Number.isNaN(price) && price >= 0) priceValues.push(price);
    }
    if (wantYear && productPasses(item, filters, 'year')) {
      const year = Number(item.year);
      if (!Number.isNaN(year) && year >= 0) yearValues.push(year);
    }
  }

  const sorted = needItems ? sortProducts(matches, spec.sort, rates) : matches;
  const pages = Math.max(1, Math.ceil(count / Math.max(pageSize, 1)));
  let page = Math.max(1, spec.page || 1);
  if (page > pages) page = pages;
  const start = (page - 1) * Math.max(pageSize, 0);
  const items = needItems ? sorted.slice(start, start + pageSize) : [];

  const result = {
    count, page, pages, items,
  };
  if (wantFacets) {
    result.facets = {
      category: sortedCounts(categoryCounts),
      brand: sortedCounts(brandCounts),
      country: sortedCounts(countryCounts),
    };
  }
  if (histograms.length) {
    result.histograms = {};
    if (wantHours) result.histograms.hours = histogramFor('hours', hoursValues);
    if (wantPrice) result.histograms.price = histogramFor('price', priceValues);
    if (wantYear) result.histograms.year = histogramFor('year', yearValues);
  }
  return result;
}

/**
 * Unique values that contain every search term.
 * @param {string[]} values
 * @param {string[]} terms
 * @returns {string[]}
 */
function matchingUniques(values, terms) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = (value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    if (!terms.every((term) => key.includes(term))) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

/**
 * Typeahead groups. Equipment rows are trimmed for postMessage.
 * @param {Array<Object>} products
 * @param {string} query
 * @returns {{ q: string, terms: string[], keywords: string[],
 *   equipment: Array<{ title: string, sku: string, url: string }>, categories: string[] }}
 */
export function suggestProducts(products, query) {
  const q = String(query || '').trim();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return {
      q, terms, keywords: [], equipment: [], categories: [],
    };
  }
  const equipment = filterProducts(products, { q });
  const brands = matchingUniques(equipment.map((item) => item.brand), terms);
  const brandKeys = new Set(brands.map((brand) => brand.toLowerCase()));
  const otherKeywords = matchingUniques(
    equipment.flatMap((item) => [
      item.product_type,
      (item.title || '').replace(/^\d{4}\s+/, ''),
    ]),
    terms,
  ).filter((keyword) => !brandKeys.has(keyword.toLowerCase()));
  const keywords = [...brands, ...otherKeywords].slice(0, SUGGESTIONS_UNIQUE_LIMIT);
  const categories = matchingUniques(
    equipment.map((item) => item.product_type),
    terms,
  ).slice(0, SUGGESTIONS_UNIQUE_LIMIT);
  return {
    q,
    terms,
    keywords,
    categories,
    equipment: equipment.slice(0, SUGGESTIONS_LIMIT).map((item) => ({
      title: item.title,
      sku: item.sku,
      url: item.url,
    })),
  };
}
