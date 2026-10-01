import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';
import {
  formatCountry,
  formatNumber,
  loadCurrencyRates,
  watchCatalog,
} from '../../scripts/product-index.js';
import { productPath } from '../../scripts/product-catalog.js';
import { formatListingPrice, readLocale } from '../../scripts/locale.js';
import {
  isLiked, LIKES_EVENT, readLikes, removeLike, saveLike,
} from '../../scripts/likes.js';
import { readViewed } from '../../scripts/viewed.js';
import {
  RECOMMENDATION_SOURCES,
  RECOMMENDATIONS_PER_SOURCE,
  assembleRecommendations,
  countriesForRegion,
  identityKeys,
  listingModel,
  seedFromRecord,
} from '../../scripts/recommended.js';

const SIMILAR_PAGE = 16;
const FALLBACK_PAGE = 48;
const HEART = 'M12 20.5S3.5 15.5 3.5 9.2C3.5 6.5 5.6 4.5 8.1 4.5c1.8 0 3.2 1.1 3.9 2.4.7-1.3 2.1-2.4 3.9-2.4 2.5 0 4.6 2 4.6 4.7 0 6.3-8.5 11.3-8.5 11.3z';

/**
 * @param {Object} spec
 * @returns {Promise<Object>}
 */
function queryCatalog(spec) {
  return new Promise((resolve) => {
    const watch = watchCatalog(spec, (result) => {
      if (!result.complete) return;
      watch.stop();
      resolve(result);
    });
  });
}

/**
 * @param {string} url
 * @returns {string}
 */
function productHref(url) {
  const value = String(url || '').trim();
  if (value.startsWith('/') || value.startsWith('http')) return value;
  return '#';
}

/**
 * @param {Array<Object>} records
 * @returns {Promise<Array<Object|null>>}
 */
async function resolvePair(records) {
  const thin = records.filter((record) => record && (!record.category || !record.model));
  const urls = thin.map((record) => record.href || record.id).filter(Boolean);
  let rows = [];
  if (urls.length) {
    const result = await queryCatalog({ urls, pageSize: urls.length });
    rows = result.items || [];
  }
  const pair = records.slice(0, 2).map((record) => {
    if (!record) return null;
    const path = productPath(record.href || record.id);
    const row = rows.find((item) => productPath(item.url) === path);
    return seedFromRecord(record, row);
  });
  while (pair.length < 2) {
    pair.push(null);
  }
  return pair;
}

/**
 * Two favorite seeds, then two visit seeds. Missing ones stay empty so their
 * slots fall through to the newest excavators.
 * @returns {Promise<Array<Object|null>>}
 */
async function loadSeeds() {
  const [favorites, visits] = await Promise.all([
    resolvePair(readLikes().slice(0, 2)),
    resolvePair(readViewed().slice(0, 2)),
  ]);
  return [...favorites, ...visits];
}

/**
 * @param {Object} seed
 * @param {Object<string, number>} rates
 * @returns {Object}
 */
function similarSpec(seed, rates) {
  return {
    category: seed.category,
    pageSize: SIMILAR_PAGE,
    rates,
    sort: 'similar',
    similar: {
      sku: seed.sku || '',
      model: seed.model || '',
      country: seed.country || '',
    },
  };
}

/**
 * @param {Object} [facets]
 * @returns {string[]}
 */
function excavatorNames(facets) {
  return (facets?.category || [])
    .map((facet) => String(facet.value || '').trim())
    .filter((name) => /(^|\s)excavators?$/i.test(name))
    .map((name) => name.toLowerCase());
}

/**
 * @param {Object<string, number>} rates
 * @returns {Promise<Array<Object>>}
 */
async function loadRecommendations(rates) {
  const seeds = await loadSeeds();
  const excluded = seeds.flatMap((seed) => identityKeys(seed));
  const groups = await Promise.all(seeds.map(async (seed) => {
    if (!seed) return [];
    const result = await queryCatalog(similarSpec(seed, rates));
    return result.items || [];
  }));
  const target = RECOMMENDATION_SOURCES * RECOMMENDATIONS_PER_SOURCE;
  let items = assembleRecommendations(groups, [], excluded);
  if (items.length >= target) return items;

  const facets = await queryCatalog({ pageSize: 0, facets: true });
  const scope = excavatorNames(facets.facets);
  if (!scope.length) return items;
  const countries = countriesForRegion(readLocale().region);
  const spec = {
    categoryScope: scope,
    sort: 'year-desc',
    pageSize: FALLBACK_PAGE,
    rates,
  };
  if (countries.length) spec.countries = countries;
  const fallback = await queryCatalog(spec);
  items = assembleRecommendations(groups, fallback.items || [], excluded);
  return items;
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {Element} [parent]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function add(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

/**
 * @returns {SVGElement}
 */
function heartIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', HEART);
  svg.append(path);
  return svg;
}

/**
 * @param {Element} root
 */
function syncHearts(root) {
  root.querySelectorAll('.save[data-like-id]').forEach((button) => {
    const liked = isLiked(button.dataset.likeId);
    button.setAttribute('aria-pressed', liked ? 'true' : 'false');
  });
}

/**
 * @param {Object} item
 * @param {Object} copy
 * @param {Object<string, number>} rates
 * @returns {HTMLElement}
 */
function renderCard(item, copy, rates) {
  const href = productHref(item.url);
  const title = item.title || item.sku || '';
  const card = add('article', 'card');

  const media = add('div', 'media', card);
  const src = String(item.image || '').trim();
  if (src.startsWith('http') || src.startsWith('/') || src.startsWith('.')) {
    const img = add('img', '', media);
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
  }
  if (item.year) add('span', 'year', media, String(item.year));

  const body = add('div', 'body', card);
  const kickerRow = add('div', 'kicker-row', body);
  add('span', 'kicker', kickerRow, item.product_type || '');
  const likeId = productPath(item.url);
  const save = add('button', 'save', kickerRow);
  save.type = 'button';
  save.setAttribute('aria-label', copy.save || 'Save');
  save.append(heartIcon());
  if (likeId && likeId !== '/') {
    save.dataset.likeId = likeId;
    save.addEventListener('click', () => {
      if (isLiked(likeId)) {
        removeLike(likeId);
        return;
      }
      const amount = Number(item.price);
      const hours = Number(item.hours);
      saveLike({
        id: likeId,
        href: likeId,
        title: title || 'Saved equipment',
        detail: [
          item.year,
          Number.isFinite(hours) ? `${formatNumber(hours)} hrs` : '',
          formatCountry(item.country),
          Number.isFinite(amount) ? formatListingPrice(amount, item.currency, rates) : '',
        ].filter(Boolean).join(' · '),
        image: src.startsWith('http') || src.startsWith('/') ? src : '',
        likedAt: Date.now(),
        sku: item.sku ? String(item.sku) : '',
        model: listingModel(item),
        country: item.country || '',
        category: item.product_type || '',
      });
    });
  }

  const heading = add('h3', 'title', body);
  const name = add('a', '', heading, title);
  name.href = href;

  const meta = add('p', 'meta', body);
  const place = [item.city, item.state].filter(Boolean).join(', ') || formatCountry(item.country);
  if (place) add('span', '', meta, place);
  const hours = Number(item.hours);
  if (Number.isFinite(hours)) {
    add('span', 'hours', meta, (copy.hoursLabel || '{count} hours').replace('{count}', formatNumber(hours)));
  }
  if (!meta.childElementCount) meta.remove();

  const price = add('div', 'price', body);
  add('div', 'price-label', price, copy.basePrice || 'Base price');
  const amount = Number(item.price);
  add('div', 'price-value', price, Number.isFinite(amount)
    ? formatListingPrice(amount, item.currency, rates)
    : (copy.callForPrice || 'Call for price'));

  const details = add('a', 'button accent details', body, copy.details || 'Details');
  details.href = href;
  return card;
}

/**
 * Decorates the recommended-equipment widget.
 * @param {Element} widget
 */
export default async function decorate(widget) {
  const [copy, rates] = await Promise.all([
    loadCopy(import.meta.url),
    loadCurrencyRates(),
  ]);
  hydrateCopy(widget, copy);
  const grid = widget.querySelector('.grid');
  const empty = widget.querySelector('.empty');
  if (!grid) return;

  const onLikes = () => syncHearts(widget);
  window.addEventListener(LIKES_EVENT, onLikes);

  const items = await loadRecommendations(rates);
  grid.replaceChildren(...items.map((item) => renderCard(item, copy, rates)));
  if (empty) empty.hidden = items.length > 0;
  syncHearts(widget);
}
