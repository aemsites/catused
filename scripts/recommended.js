/**
 * Picks recommended listings from recent favorites and recent PDP visits.
 * Each of the four seeds (two favorites, then two visits) contributes its two
 * closest matches. Any of those eight slots that the catalog cannot fill is
 * taken by the newest excavators in the visitor's selected country.
 */

import { hasProductImage, productPath } from './product-catalog.js';

export const RECOMMENDATION_SOURCES = 4;
export const RECOMMENDATIONS_PER_SOURCE = 2;

/**
 * Region from the locale picker, mapped to the ISO codes stored on listings.
 * Europe is one market in the picker and many countries in the catalog.
 * The United Kingdom is its own market, so it is not part of Europe here.
 */
const REGION_COUNTRIES = {
  'United States': ['US'],
  Canada: ['CA'],
  'United Kingdom': ['GB', 'UK'],
  Australia: ['AU'],
  Singapore: ['SG'],
  Japan: ['JP'],
  Poland: ['PL'],
  Indonesia: ['ID'],
  Europe: [
    'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
    'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL',
    'PT', 'RO', 'SE', 'SI', 'SK',
  ],
};

/**
 * @param {string} region
 * @returns {string[]}
 */
export function countriesForRegion(region) {
  return (REGION_COUNTRIES[region] || []).slice();
}

/**
 * Model token buried in a catalog title, for likes saved before the model
 * was stored. "2025 Cat 306-07 Track Excavators" becomes "306-07".
 * @param {Object} item
 * @returns {string}
 */
export function listingModel(item) {
  let title = String(item?.title || '').trim().replace(/^\d{4}\s+/, '');
  const brand = String(item?.brand || '').trim();
  if (brand && title.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
    title = title.slice(brand.length).trim();
  }
  const type = String(item?.product_type || item?.category || '').trim();
  if (type && title.toLowerCase().endsWith(type.toLowerCase())) {
    title = title.slice(0, title.length - type.length).trim();
  }
  return title;
}

/**
 * Seed the similar-listings query can rank against. Category is required;
 * without it the ranker would search the whole catalog.
 * @param {Object} record A like or a viewed PDP
 * @param {Object} [row] Catalog row for the same url, when the record is thin
 * @returns {Object|null}
 */
export function seedFromRecord(record, row = null) {
  if (!record) return null;
  const item = row || {};
  const category = record.category || item.product_type || '';
  const model = record.model || listingModel({
    title: item.title || record.title,
    brand: item.brand || record.brand,
    product_type: category,
  });
  if (!category) return null;
  return {
    sku: String(record.sku || item.sku || ''),
    model,
    country: record.country || item.country || '',
    category,
    url: record.href || record.id || item.url || '',
  };
}

/**
 * Sku and path keys so a machine the visitor already opened or saved is not
 * recommended back to them, and so the same listing is not shown twice.
 * @param {Object} item
 * @returns {string[]}
 */
export function identityKeys(item) {
  if (!item) return [];
  const keys = [];
  const sku = String(item.sku || '').trim();
  if (sku) keys.push(`sku:${sku}`);
  const path = productPath(item.url || item.href || item.id || '');
  if (path && path !== '/') keys.push(`url:${path}`);
  return keys;
}

/**
 * @param {Set<string>} seen
 * @param {Object} item
 * @returns {boolean}
 */
function alreadyUsed(seen, item) {
  return identityKeys(item).some((key) => seen.has(key));
}

/**
 * @param {Set<string>} seen
 * @param {Object} item
 */
function remember(seen, item) {
  identityKeys(item).forEach((key) => seen.add(key));
}

/**
 * @param {Array<Array<Object>>} groups Similar hits for each seed, favorites first
 * @param {Array<Object>} fallbacks Newest excavators in the selected country
 * @param {string[]} excluded Identity keys of the seeds themselves
 * @returns {Array<Object>}
 */
export function assembleRecommendations(groups, fallbacks, excluded = []) {
  const seen = new Set(excluded);
  const picked = [];
  const slots = [];
  for (let i = 0; i < RECOMMENDATION_SOURCES; i += 1) {
    slots.push(groups[i] || []);
  }
  slots.forEach((items) => {
    let took = 0;
    items.forEach((item) => {
      if (took >= RECOMMENDATIONS_PER_SOURCE) return;
      if (!item || !hasProductImage(item) || alreadyUsed(seen, item)) return;
      remember(seen, item);
      picked.push(item);
      took += 1;
    });
  });
  const target = RECOMMENDATION_SOURCES * RECOMMENDATIONS_PER_SOURCE;
  (fallbacks || []).forEach((item) => {
    if (picked.length >= target) return;
    if (!item || !hasProductImage(item) || alreadyUsed(seen, item)) return;
    remember(seen, item);
    picked.push(item);
  });
  return picked;
}
