import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';
import { loadCSS } from '../../scripts/aem.js';
import {
  HOURS_CAP,
  HOURS_STEP,
  PRICE_CAP_USD,
  PRICE_STEP,
  YEAR_MAX,
  YEAR_MIN,
  YEAR_STEP,
  formatCountry,
  formatNumber,
  hasProductImage,
  formatYear,
  loadCurrencyRates,
  loadCategories,
  impliedCategoryScope,
  isCategoryListing,
  priceUsd,
  readPlpParams,
  applyPlpParams,
  watchCatalog,
} from '../../scripts/product-index.js';
import attachRangeFilter from '../../scripts/range-filter.js';
import { highlightTerms } from '../../scripts/suggestions.js';
import { setOdometerLabel } from '../../scripts/odometer.js';
import { formatListingPrice } from '../../scripts/locale.js';
import {
  isLiked, removeLike, saveLike, saveSearch, LIKES_EVENT,
} from '../../scripts/likes.js';

const PAGE_SIZE = 50;

/**
 * Writes PLP filters to the page query string.
 * @param {Object} state
 */
function writeParams(state) {
  const params = applyPlpParams(new URLSearchParams(window.location.search), state);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', url);
}

/**
 * Populates a select with counted facet options, sorted by count.
 * @param {HTMLSelectElement} select
 * @param {Array<{ value: string, count: number }>} facets
 * @param {string} anyLabel
 * @param {string} current
 * @param {Function} [labelFor]
 */
function fillFacetSelect(select, facets, anyLabel, current, labelFor) {
  if (!select) return;
  const items = facets.filter((facet) => facet.count > 0);
  if (current && !items.some((facet) => facet.value === current)) {
    items.push({ value: current, count: 0 });
  }
  select.replaceChildren();
  const any = document.createElement('option');
  any.value = '';
  any.textContent = anyLabel;
  select.append(any);
  items.forEach((facet) => {
    const option = document.createElement('option');
    option.value = facet.value;
    const name = labelFor ? labelFor(facet.value) : facet.value;
    option.textContent = `${name} (${formatNumber(facet.count)})`;
    select.append(option);
  });
  if (current) select.value = current;
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
 * Same id the product page stores, so a card heart and a PDP heart are one like.
 * @param {string} url
 * @returns {string}
 */
function productId(url) {
  const href = productHref(url);
  if (href === '#') return '';
  try {
    const path = new URL(href, window.location.origin).pathname;
    return path && path !== '/' ? path : '';
  } catch {
    return '';
  }
}

/**
 * @param {Object} item
 * @param {Object<string, number>} rates
 * @returns {string}
 */
function cardLikeDetail(item, rates) {
  const hours = Number(item.hours);
  const usd = priceUsd(item, rates);
  return [
    item.year,
    Number.isFinite(hours) ? `${formatNumber(hours)} hrs` : '',
    formatCountry(item.country),
    Number.isNaN(usd) ? '' : formatListingPrice(usd, 'USD', rates),
  ].filter(Boolean).join(' · ');
}

/**
 * Sends a copy of an icon from a button to the account icon.
 * @param {HTMLElement} from
 * @param {boolean} fill
 */
function flyToAccount(from, fill) {
  const target = document.querySelector('.nav-account-button');
  const svg = from.querySelector('svg');
  if (!target || !svg) return;
  const start = from.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  const flyer = document.createElement('span');
  const mark = svg.cloneNode(true);
  mark.style.width = '22px';
  mark.style.height = '22px';
  mark.style.fill = fill ? 'currentcolor' : 'none';
  mark.style.stroke = 'currentcolor';
  mark.style.strokeWidth = '2';
  flyer.append(mark);
  const x = start.left + (start.width / 2);
  const y = start.top + (start.height / 2);
  flyer.style.left = `${x}px`;
  flyer.style.top = `${y}px`;
  flyer.style.position = 'fixed';
  flyer.style.zIndex = '2000';
  flyer.style.width = '22px';
  flyer.style.height = '22px';
  flyer.style.pointerEvents = 'none';
  flyer.style.color = 'var(--color-brand)';
  document.documentElement.append(flyer);
  const dx = (end.left + (end.width / 2)) - x;
  const dy = (end.top + (end.height / 2)) - y;
  const motion = flyer.animate([
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    {
      transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy * 0.35}px)) scale(1.15)`,
      opacity: 1,
      offset: 0.45,
    },
    {
      transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.45)`,
      opacity: 0.3,
    },
  ], { duration: 1100, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  motion.onfinish = () => flyer.remove();
}

/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {string[]} terms
 */
function setHighlightedText(el, text, terms) {
  const value = text || '';
  if (!terms.length) {
    el.textContent = value;
    return;
  }
  el.innerHTML = highlightTerms(value, terms);
}

/**
 * Compact page list with gaps as 0.
 * @param {number} current
 * @param {number} pages
 * @returns {number[]}
 */
function pageItems(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const marks = new Set([1, pages, current - 1, current, current + 1]);
  const list = [...marks].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out.push(0);
    out.push(n);
  });
  return out;
}

/**
 * Renders one product card.
 * @param {Object} item
 * @param {Object} copy
 * @param {Object<string, number>} rates
 * @param {string[]} [terms]
 * @returns {HTMLElement}
 */
function renderCard(item, copy, rates, terms = []) {
  const card = document.createElement('article');
  card.className = 'pcard';

  const media = document.createElement('div');
  media.className = 'media';
  const src = String(item.image || '').trim();
  if (src.startsWith('http') || src.startsWith('/') || src.startsWith('.')) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = item.title || '';
    img.loading = 'lazy';
    media.append(img);
  }
  if (item.year) {
    const year = document.createElement('span');
    year.className = 'yr';
    year.textContent = String(item.year);
    media.append(year);
  }
  card.append(media);

  const body = document.createElement('div');
  body.className = 'body';

  const catRow = document.createElement('div');
  catRow.className = 'cat-row';
  const cat = document.createElement('span');
  cat.className = 'cat';
  setHighlightedText(cat, item.product_type || '', terms);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'save';
  const likeId = productId(item.url);
  const liked = likeId && isLiked(likeId);
  save.setAttribute('aria-label', copy.save || 'Save');
  save.setAttribute('aria-pressed', liked ? 'true' : 'false');
  if (likeId) save.dataset.likeId = likeId;
  if (liked) save.classList.add('saved');
  const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  heart.setAttribute('viewBox', '0 0 24 24');
  heart.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 20.5S3.5 15.5 3.5 9.2C3.5 6.5 5.6 4.5 8.1 4.5c1.8 0 3.2 1.1 3.9 2.4.7-1.3 2.1-2.4 3.9-2.4 2.5 0 4.6 2 4.6 4.7 0 6.3-8.5 11.3-8.5 11.3z');
  heart.append(path);
  save.append(heart);
  save.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!likeId) return;
    if (isLiked(likeId)) {
      removeLike(likeId);
      return;
    }
    saveLike({
      id: likeId,
      href: likeId,
      title: item.title || item.sku || 'Saved equipment',
      detail: cardLikeDetail(item, rates),
      image: hasProductImage(item) ? String(item.image).trim() : '',
      likedAt: Date.now(),
    });
    flyToAccount(save, true);
  });
  catRow.append(cat, save);
  body.append(catRow);

  const title = document.createElement('h2');
  title.className = 'title';
  setHighlightedText(title, item.title || item.sku || '', terms);
  body.append(title);

  const locRow = document.createElement('div');
  locRow.className = 'loc-row';
  const place = formatCountry(item.country);
  if (place) {
    const loc = document.createElement('span');
    loc.textContent = place;
    locRow.append(loc);
  }
  const hours = Number(item.hours);
  if (!Number.isNaN(hours)) {
    const chip = document.createElement('span');
    chip.className = 'hours';
    chip.textContent = (copy.hoursLabel || '{count} hours')
      .replace('{count}', formatNumber(hours));
    locRow.append(chip);
  }
  if (locRow.childNodes.length) body.append(locRow);

  if (item.condition_rating) {
    const specs = document.createElement('div');
    specs.className = 'spec-row';
    const spec = document.createElement('div');
    spec.className = 'spec';
    const specKey = document.createElement('div');
    specKey.className = 'k';
    specKey.textContent = copy.condition || 'Condition';
    const specVal = document.createElement('div');
    specVal.className = 'v';
    specVal.textContent = item.condition_rating;
    spec.append(specKey, specVal);
    specs.append(spec);
    body.append(specs);
  }

  const priceBlock = document.createElement('div');
  priceBlock.className = 'price-b';
  const priceKey = document.createElement('div');
  priceKey.className = 'k';
  priceKey.textContent = copy.basePrice || 'Base price';
  const priceVal = document.createElement('div');
  priceVal.className = 'v';
  const usd = priceUsd(item, rates);
  priceVal.textContent = Number.isNaN(usd) ? '' : formatListingPrice(usd, 'USD', rates);
  priceBlock.append(priceKey, priceVal);
  body.append(priceBlock);

  const details = document.createElement('a');
  details.className = 'button accent';
  details.href = productHref(item.url);
  details.textContent = copy.details || 'Details';
  body.append(details);

  card.append(body);
  return card;
}

/**
 * Decorates the product listing widget.
 * @param {Element} widget
 */
export default async function decorate(widget) {
  await loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-search.css`);
  const listingPath = window.location.pathname;
  const categoryPage = isCategoryListing(listingPath);
  const [copy, rates, categories] = await Promise.all([
    loadCopy(import.meta.url),
    loadCurrencyRates(),
    categoryPage ? loadCategories() : Promise.resolve([]),
  ]);
  const categoryScope = impliedCategoryScope(listingPath, categories);
  hydrateCopy(widget, copy);

  const form = widget.querySelector('form');
  const grid = widget.querySelector('#plp-grid');
  const empty = widget.querySelector('.empty');
  const chipsEl = widget.querySelector('.chips');
  const input = widget.querySelector('#plp-query');
  const categorySelect = widget.querySelector('#plp-category');
  const brandSelect = widget.querySelector('#plp-brand');
  const countrySelect = widget.querySelector('#plp-country');
  const sortSelect = widget.querySelector('#plp-sort');
  const hoursField = widget.querySelector('.hours-field');
  const yearField = widget.querySelector('.year-field');
  const priceField = widget.querySelector('.price-field');
  const sidebar = widget.querySelector('#plp-sidebar');
  const scrim = widget.querySelector('.scrim');
  const pager = widget.querySelector('.pager');
  if (!form || !grid) return;

  const initial = readPlpParams();
  let { page } = initial;
  if (input) input.value = initial.q;
  if (sortSelect) sortSelect.value = initial.sort;

  let hoursRange = { min: initial.hoursMin, max: initial.hoursMax };
  let yearRange = { min: initial.yearMin, max: initial.yearMax };
  let priceRange = { min: initial.priceMin, max: initial.priceMax };
  let hoursControl;
  let yearControl;
  let priceControl;

  const currentState = () => ({
    q: input?.value || '',
    category: categorySelect?.options.length ? categorySelect.value : (initial.category || ''),
    brand: brandSelect?.options.length ? brandSelect.value : (initial.brand || ''),
    country: countrySelect?.options.length ? countrySelect.value : (initial.country || ''),
    sort: sortSelect?.value || 'relevance',
    hoursMin: hoursRange.min,
    hoursMax: hoursRange.max,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
    yearMin: yearRange.min,
    yearMax: yearRange.max,
    page,
    rates,
    categoryScope,
  });

  const refreshFacets = (facets = {}) => {
    const state = currentState();
    fillFacetSelect(
      categorySelect,
      facets.category || [],
      copy.chooseCategory || copy.any || 'Any',
      state.category,
    );
    fillFacetSelect(
      brandSelect,
      facets.brand || [],
      copy.chooseBrand || copy.any || 'Any',
      state.brand,
    );
    fillFacetSelect(
      countrySelect,
      facets.country || [],
      copy.chooseLocation || copy.any || 'Any',
      state.country,
      formatCountry,
    );
  };

  const setCount = (count) => {
    widget.querySelectorAll('.count, .m-count').forEach((el) => {
      setOdometerLabel(el, count, copy.results || '{count} results', formatNumber);
    });
  };

  let applyFilters = () => {};
  let catalog;
  let latestItems = [];
  let latestCount = 0;

  const searchBadges = (state) => {
    const badges = [];
    const query = String(state.q || '').trim();
    if (query) badges.push(query);
    if (state.category) badges.push(state.category);
    if (state.brand) badges.push(state.brand);
    if (state.country) badges.push(formatCountry(state.country));
    if (state.yearMin != null || state.yearMax != null) {
      const min = state.yearMin != null ? formatYear(state.yearMin) : (copy.min || 'Min');
      const max = state.yearMax != null ? formatYear(state.yearMax) : (copy.any || 'Any');
      badges.push(`${min}–${max}`);
    }
    if (state.hoursMin != null || state.hoursMax != null) {
      const min = state.hoursMin != null ? formatNumber(state.hoursMin) : '0';
      const max = state.hoursMax != null ? formatNumber(state.hoursMax) : (copy.any || 'Any');
      badges.push(`${min}–${max} hrs`);
    }
    if (state.priceMin != null || state.priceMax != null) {
      const min = formatListingPrice(state.priceMin || 0, 'USD', rates);
      const max = state.priceMax != null
        ? formatListingPrice(state.priceMax, 'USD', rates)
        : (copy.any || 'Any');
      badges.push(`${min}–${max}`);
    }
    return badges;
  };

  window.addEventListener(LIKES_EVENT, () => {
    grid.querySelectorAll('.save[data-like-id]').forEach((button) => {
      const on = isLiked(button.dataset.likeId);
      button.classList.toggle('saved', on);
      button.setAttribute('aria-pressed', String(on));
    });
  });

  widget.querySelector('.save-search')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const state = currentState();
    const images = latestItems
      .filter((item) => hasProductImage(item))
      .slice(0, 3)
      .map((item) => String(item.image).trim());
    const id = [
      window.location.pathname,
      state.q, state.category, state.brand, state.country,
      state.hoursMin, state.hoursMax, state.priceMin, state.priceMax,
      state.yearMin, state.yearMax,
    ].join('|');
    saveSearch({
      id,
      href: `${window.location.pathname}${window.location.search}`,
      title: 'Saved search',
      count: latestCount,
      images,
      badges: searchBadges(state),
      likedAt: Date.now(),
    });
    flyToAccount(button, false);
  });

  const paintChips = (state) => {
    if (!chipsEl) return;
    chipsEl.replaceChildren();
    const chips = [];
    const add = (facet, label, onClear) => {
      if (!label) return;
      chips.push({ facet, label, onClear });
    };
    add('category', state.category, () => { categorySelect.value = ''; });
    add('brand', state.brand, () => { brandSelect.value = ''; });
    add('country', state.country && formatCountry(state.country), () => {
      countrySelect.value = '';
    });
    if (state.yearMin != null || state.yearMax != null) {
      const min = state.yearMin != null ? formatYear(state.yearMin) : (copy.min || 'Min');
      const max = state.yearMax != null ? formatYear(state.yearMax) : `${copy.any || 'Any'}`;
      add('year', `${min} – ${max}`, () => yearControl?.setRange({}));
    }
    if (state.hoursMin != null || state.hoursMax != null) {
      const min = state.hoursMin != null ? formatNumber(state.hoursMin) : '0';
      const max = state.hoursMax != null ? formatNumber(state.hoursMax) : `${copy.any || 'Any'}`;
      add('hours', `${min} – ${max}`, () => hoursControl?.setRange({}));
    }
    if (state.priceMin != null || state.priceMax != null) {
      const min = formatListingPrice(state.priceMin || 0, 'USD', rates);
      const max = state.priceMax != null ? formatListingPrice(state.priceMax, 'USD', rates) : `${copy.any || 'Any'}`;
      add('price', `${min} – ${max}`, () => priceControl?.setRange({}));
    }
    chips.forEach((chip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.textContent = chip.label;
      button.addEventListener('click', () => {
        chip.onClear();
        applyFilters();
      });
      chipsEl.append(button);
    });
    chipsEl.hidden = !chips.length;
    const badge = widget.querySelector('.btn-filter .n');
    if (badge) {
      badge.hidden = !chips.length;
      badge.textContent = String(chips.length);
    }
  };

  const paintPager = (pages) => {
    if (!pager) return;
    pager.replaceChildren();
    if (pages <= 1) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    const go = (next) => {
      page = next;
      applyFilters({ resetPage: false });
      widget.querySelector('.search-panel')?.scrollIntoView({ block: 'start' });
    };
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = copy.previous || 'Previous';
    prev.disabled = page <= 1;
    prev.addEventListener('click', () => go(page - 1));
    pager.append(prev);
    pageItems(page, pages).forEach((n) => {
      if (!n) {
        const gap = document.createElement('span');
        gap.className = 'gap';
        gap.textContent = '…';
        pager.append(gap);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(n);
      if (n === page) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => go(n));
      pager.append(button);
    });
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = copy.next || 'Next';
    next.disabled = page >= pages;
    next.addEventListener('click', () => go(page + 1));
    pager.append(next);
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = (copy.pageStatus || 'Page {page} of {pages}')
      .replace('{page}', formatNumber(page))
      .replace('{pages}', formatNumber(pages));
    pager.append(status);
  };

  const catalogSpec = () => {
    const state = currentState();
    return {
      q: state.q,
      category: state.category,
      brand: state.brand,
      country: state.country,
      sort: state.sort,
      hoursMin: state.hoursMin,
      hoursMax: state.hoursMax,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
      yearMin: state.yearMin,
      yearMax: state.yearMax,
      rates: state.rates,
      categoryScope: state.categoryScope,
      page,
      pageSize: PAGE_SIZE,
      facets: true,
      histograms: ['hours', 'year', 'price'],
    };
  };

  applyFilters = (opts = {}) => {
    if (opts.resetPage !== false) page = 1;
    const state = currentState();
    paintChips(state);
    writeParams({ ...state, page });
    catalog?.update(catalogSpec());
  };

  if (hoursField) {
    hoursControl = attachRangeFilter(hoursField, {
      copy,
      inline: true,
      step: HOURS_STEP,
      cap: HOURS_CAP,
      initial: { min: initial.hoursMin, max: initial.hoursMax },
      getValue: (item) => item.hours,
      formatValue: formatNumber,
      onChange: () => {
        hoursRange = hoursControl.getRange();
        applyFilters();
      },
    });
    hoursRange = hoursControl.getRange();
  }

  if (yearField) {
    yearControl = attachRangeFilter(yearField, {
      copy,
      inline: true,
      step: YEAR_STEP,
      origin: YEAR_MIN,
      cap: YEAR_MAX,
      over: false,
      initial: { min: initial.yearMin, max: initial.yearMax },
      getValue: (item) => item.year,
      formatValue: formatYear,
      onChange: () => {
        yearRange = yearControl.getRange();
        applyFilters();
      },
    });
    yearRange = yearControl.getRange();
  }

  if (priceField) {
    priceControl = attachRangeFilter(priceField, {
      copy,
      inline: true,
      step: PRICE_STEP,
      cap: PRICE_CAP_USD,
      initial: { min: initial.priceMin, max: initial.priceMax },
      getValue: (item) => item.price,
      formatValue: (value) => formatListingPrice(value, 'USD', rates),
      onChange: () => {
        priceRange = priceControl.getRange();
        applyFilters();
      },
    });
    priceRange = priceControl.getRange();
  }

  widget.querySelectorAll('.acc-head').forEach((head) => {
    head.addEventListener('click', () => head.parentElement.classList.toggle('open'));
  });

  const openDrawer = () => {
    sidebar?.classList.add('open');
    if (scrim) scrim.hidden = false;
  };
  const closeDrawer = () => {
    sidebar?.classList.remove('open');
    if (scrim) scrim.hidden = true;
  };
  widget.querySelector('.btn-filter')?.addEventListener('click', openDrawer);
  widget.querySelector('.drawer-close-btn')?.addEventListener('click', closeDrawer);
  scrim?.addEventListener('click', closeDrawer);

  widget.querySelector('.clear-filters')?.addEventListener('click', () => {
    if (input) input.value = '';
    if (categorySelect) categorySelect.value = '';
    if (brandSelect) brandSelect.value = '';
    if (countrySelect) countrySelect.value = '';
    if (sortSelect) sortSelect.value = 'relevance';
    hoursControl?.setRange({});
    yearControl?.setRange({});
    priceControl?.setRange({});
    hoursRange = hoursControl?.getRange() || { min: null, max: null };
    yearRange = yearControl?.getRange() || { min: null, max: null };
    priceRange = priceControl?.getRange() || { min: null, max: null };
    applyFilters();
  });

  widget.querySelector('.clr')?.addEventListener('click', () => {
    if (!input) return;
    input.value = '';
    input.focus();
    applyFilters();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  widget.querySelectorAll('.facet, #plp-sort').forEach((el) => {
    el.addEventListener('change', applyFilters);
  });
  input?.addEventListener('input', applyFilters);

  catalog = watchCatalog(catalogSpec(), (result) => {
    if (result.page && result.page !== page) {
      page = result.page;
      writeParams({ ...currentState(), page });
    }
    refreshFacets(result.facets);
    if (result.histograms?.hours) hoursControl?.updateHistogram(result.histograms.hours);
    if (result.histograms?.year) yearControl?.updateHistogram(result.histograms.year);
    if (result.histograms?.price) priceControl?.updateHistogram(result.histograms.price);
    const state = currentState();
    const terms = String(state.q || '').trim().toLowerCase().split(/\s+/)
      .filter(Boolean);
    grid.replaceChildren();
    latestItems = result.items || [];
    latestCount = result.count || 0;
    latestItems.forEach((item) => grid.append(renderCard(item, copy, rates, terms)));
    if (empty) empty.hidden = latestCount > 0;
    setCount(result.count || 0);
    paintPager(result.pages || 1);
  });
  applyFilters({ resetPage: false });
}
