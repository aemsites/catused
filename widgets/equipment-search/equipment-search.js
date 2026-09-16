import { loadCopy, hydrateCopy, fetchJson } from '../../scripts/scripts.js';

const PRODUCTS_INDEX = 'https://main--catused--aemsites.aem.network/products/index.json';
const SUGGESTIONS_DEBOUNCE_MS = 150;
const SUGGESTIONS_PREVIEW = 4;

const HOURS_STEP = 500;
const PRICE_STEP = 20000;

/**
 * Loads and caches the products index.
 * @returns {Promise<Array<Object>>}
 */
async function loadProducts() {
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
 * Filters products by query, hours range, and price range.
 * @param {Array<Object>} products
 * @param {{ q: string, hoursMin: number|null, hoursMax: number|null,
 *   priceMin: number|null, priceMax: number|null }} filters
 * @returns {Array<Object>}
 */
function filterProducts(products, {
  q, hoursMin, hoursMax, priceMin, priceMax,
}) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return products.filter((item) => {
    if (terms.length) {
      const haystack = [item.title, item.product_type, item.sku, item.brand]
        .join(' ')
        .toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    const hours = Number(item.hours);
    if (hoursMin != null && (Number.isNaN(hours) || hours < hoursMin)) return false;
    if (hoursMax != null && (Number.isNaN(hours) || hours > hoursMax)) return false;
    const price = Number(item.price);
    if (priceMin != null && (Number.isNaN(price) || price < priceMin)) return false;
    if (priceMax != null && (Number.isNaN(price) || price > priceMax)) return false;
    return true;
  });
}

/**
 * Escape a plain-text string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

/**
 * Highlight matching substrings with `mark` elements.
 * @param {string} text
 * @param {string[]} terms
 * @returns {string}
 */
function highlightTerms(text, terms) {
  if (!text || !terms?.length) return escapeHTML(text);
  const intervals = [];
  const lower = text.toLowerCase();
  terms.forEach((term) => {
    const needle = term.toLowerCase();
    if (!needle) return;
    let start = 0;
    while (start < lower.length) {
      const idx = lower.indexOf(needle, start);
      if (idx === -1) break;
      intervals.push([idx, idx + needle.length]);
      start = idx + needle.length;
    }
  });
  if (!intervals.length) return escapeHTML(text);
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i += 1) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) last[1] = Math.max(last[1], intervals[i][1]);
    else merged.push(intervals[i]);
  }
  let result = '';
  let pos = 0;
  merged.forEach(([start, end]) => {
    result += escapeHTML(text.substring(pos, start));
    result += `<mark>${escapeHTML(text.substring(start, end))}</mark>`;
    pos = end;
  });
  result += escapeHTML(text.substring(pos));
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
 * Builds grouped typeahead suggestions from the product index.
 * @param {Array<Object>} products
 * @param {string} query
 * @returns {{ terms: string[], keywords: string[], equipment: Array<Object>,
 *   categories: string[] }}
 */
function buildSuggestions(products, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return {
      terms, keywords: [], equipment: [], categories: [],
    };
  }
  const equipment = filterProducts(products, {
    q: query,
    hoursMin: null,
    hoursMax: null,
    priceMin: null,
    priceMax: null,
  });
  const keywords = matchingUniques(
    equipment.flatMap((item) => [
      item.product_type,
      (item.title || '').replace(/^\d{4}\s+/, ''),
    ]),
    terms,
  );
  const categories = matchingUniques(equipment.map((item) => item.product_type), terms);
  return {
    terms, keywords, equipment, categories,
  };
}

/**
 * Renders one suggestion group with an optional Show more control.
 * @param {Object} opts
 * @returns {HTMLElement|null}
 */
function renderSuggestionGroup({
  title, items, expanded, onExpand, copy, renderItem,
}) {
  if (!items.length) return null;
  const visible = expanded ? items : items.slice(0, SUGGESTIONS_PREVIEW);
  const section = document.createElement('section');
  section.className = 'suggestions-group';

  const heading = document.createElement('h2');
  heading.textContent = title;
  section.append(heading);

  const list = document.createElement('ul');
  visible.forEach((item) => list.append(renderItem(item)));
  section.append(list);

  if (!expanded && items.length > SUGGESTIONS_PREVIEW) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'suggestions-more';
    more.textContent = copy.showMore || 'Show more';
    more.addEventListener('click', onExpand);
    section.append(more);
  }
  return section;
}

/**
 * Attaches a grouped suggestions overlay to the query field.
 * @param {HTMLInputElement} input
 * @param {Object} opts
 */
function attachSuggestions(input, {
  products, copy, onPickQuery,
}) {
  const anchor = input.closest('.field') || input.parentElement;
  if (!anchor) return;

  const overlay = document.createElement('div');
  overlay.className = 'suggestions';
  overlay.id = `${input.id}-suggestions`;
  overlay.hidden = true;
  overlay.setAttribute('role', 'listbox');
  anchor.classList.add('suggestions-anchor');
  anchor.append(overlay);

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', overlay.id);
  input.setAttribute('aria-expanded', 'false');

  const expanded = {
    keywords: false, equipment: false, categories: false,
  };
  let debounceTimer;
  let currentQuery = '';

  const hideOverlay = () => {
    overlay.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  const showOverlay = () => {
    overlay.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const getFocusable = () => [...overlay.querySelectorAll('a, button')];

  const pickQuery = (value) => {
    input.value = value;
    onPickQuery();
    hideOverlay();
    input.focus();
  };

  const render = (query) => {
    currentQuery = query;
    const trimmed = query.trim();
    if (!trimmed) {
      overlay.replaceChildren();
      hideOverlay();
      return;
    }

    const {
      terms, keywords, equipment, categories,
    } = buildSuggestions(products, trimmed);
    overlay.replaceChildren();

    const groups = [
      renderSuggestionGroup({
        title: copy.suggestedKeywords || 'Suggested keywords',
        items: keywords,
        expanded: expanded.keywords,
        onExpand: () => {
          expanded.keywords = true;
          render(currentQuery);
        },
        copy,
        renderItem: (keyword) => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'suggestions-link';
          button.innerHTML = highlightTerms(keyword, terms);
          button.addEventListener('click', () => pickQuery(keyword));
          li.append(button);
          return li;
        },
      }),
      renderSuggestionGroup({
        title: copy.equipment || 'Equipment',
        items: equipment,
        expanded: expanded.equipment,
        onExpand: () => {
          expanded.equipment = true;
          render(currentQuery);
        },
        copy,
        renderItem: (item) => {
          const li = document.createElement('li');
          const link = document.createElement('a');
          link.className = 'suggestions-link';
          link.href = item.url || '#';
          link.innerHTML = highlightTerms(item.title || item.sku || '', terms);
          li.append(link);
          return li;
        },
      }),
      renderSuggestionGroup({
        title: copy.category || 'Category',
        items: categories,
        expanded: expanded.categories,
        onExpand: () => {
          expanded.categories = true;
          render(currentQuery);
        },
        copy,
        renderItem: (category) => {
          const li = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'suggestions-link';
          button.innerHTML = highlightTerms(category, terms);
          button.addEventListener('click', () => pickQuery(category));
          li.append(button);
          return li;
        },
      }),
    ].filter(Boolean);

    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'suggestions-empty';
      empty.textContent = copy.noResults || 'No results found';
      overlay.append(empty);
    } else {
      groups.forEach((group) => overlay.append(group));
    }
    showOverlay();
  };

  const scheduleRender = () => {
    expanded.keywords = false;
    expanded.equipment = false;
    expanded.categories = false;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(input.value), SUGGESTIONS_DEBOUNCE_MS);
  };

  const onDocumentClick = (event) => {
    if (anchor.contains(event.target)) return;
    hideOverlay();
  };

  const onInputKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideOverlay();
      return;
    }
    if (overlay.hidden || event.key !== 'ArrowDown') return;
    const items = getFocusable();
    if (!items.length) return;
    event.preventDefault();
    items[0].focus();
  };

  const onOverlayKeydown = (event) => {
    const items = getFocusable();
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[current < items.length - 1 ? current + 1 : 0]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (current <= 0) input.focus();
      else items[current - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideOverlay();
      input.focus();
    } else if (event.key === 'Tab') {
      hideOverlay();
    }
  };

  input.addEventListener('input', scheduleRender);
  input.addEventListener('focus', () => {
    if (input.value.trim() && overlay.children.length) showOverlay();
    else if (input.value.trim()) render(input.value);
  });
  input.addEventListener('keydown', onInputKeydown);
  overlay.addEventListener('keydown', onOverlayKeydown);
  document.addEventListener('click', onDocumentClick);
}

/**
 * Formats a numeric value for display.
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Formats a price value for display.
 * @param {number} value
 * @returns {string}
 */
function formatPrice(value) {
  return `$${formatNumber(value)}`;
}

/**
 * Parses a typed numeric value.
 * @param {string} raw
 * @returns {number}
 */
function parseNumber(raw) {
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
function formatBound(value, format, domain, copy) {
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
function parseBound(raw, domain) {
  if (String(raw).trim().endsWith('+')) return domain.max;
  return parseNumber(raw);
}

/**
 * Numeric values from products via an accessor.
 * @param {Array<Object>} products
 * @param {Function} getValue
 * @returns {number[]}
 */
function numericValues(products, getValue) {
  return products
    .map((item) => Number(getValue(item)))
    .filter((value) => !Number.isNaN(value) && value >= 0);
}

/**
 * Snaps a value to the nearest step within the domain.
 * @param {number} value
 * @param {{ min: number, max: number }} domain
 * @param {number} step
 * @returns {number}
 */
function snapValue(value, domain, step) {
  const snapped = Math.round(value / step) * step;
  return Math.min(domain.max, Math.max(domain.min, snapped));
}

/**
 * Slider/histogram domain: 0 to lastRegular, plus one over tick.
 * @param {number[]} values
 * @param {number} step
 * @returns {{ min: number, max: number, lastRegular: number }}
 */
function valueDomain(values, step) {
  const dataMax = values.length ? Math.max(...values) : 0;
  const lastRegular = Math.max(step, Math.floor(dataMax / step) * step);
  return { min: 0, max: lastRegular + step, lastRegular };
}

/**
 * Builds histogram bins in step-sized buckets; the last bin is unbounded.
 * @param {number[]} values
 * @param {{ min: number, max: number, lastRegular: number }} domain
 * @param {number} step
 * @returns {Array<{ start: number, end: number, over: boolean, ratio: number }>}
 */
function buildHistogram(values, domain, step) {
  const { min, max, lastRegular } = domain;
  const bins = Math.max(1, Math.round((max - min) / step));
  const counts = Array(bins).fill(0);
  values.forEach((value) => {
    let index = value >= lastRegular
      ? bins - 1
      : Math.floor((value - min) / step);
    if (index >= bins) index = bins - 1;
    if (index < 0) index = 0;
    counts[index] += 1;
  });
  const peak = Math.max(1, ...counts);
  return counts.map((count, index) => {
    const start = min + index * step;
    const over = index === bins - 1;
    return {
      start,
      end: over ? Infinity : start + step,
      over,
      ratio: count / peak,
    };
  });
}

/**
 * Dual-handle range, histogram, and min/max fields.
 * @param {Element} field
 * @param {Object} opts
 * @returns {{ getRange: () => { min: number|null, max: number|null }, updateHistogram: Function }}
 */
function attachRangeFilter(field, {
  products, copy, onChange, getValue, step, formatValue,
}) {
  const trigger = field.querySelector('.range-trigger');
  const valueEl = field.querySelector('.range-trigger-value');
  const panel = field.querySelector('.range-panel');
  const histogramEl = field.querySelector('.range-histogram');
  const railActive = field.querySelector('.range-rail-active');
  const minSlider = field.querySelector('.range-thumb-min');
  const maxSlider = field.querySelector('.range-thumb-max');
  const minInput = field.querySelector('.range-min-input');
  const maxInput = field.querySelector('.range-max-input');
  if (!trigger || !panel || !minSlider || !maxSlider || !minInput || !maxInput) {
    return { getRange: () => ({ min: null, max: null }), updateHistogram: () => {} };
  }

  const format = formatValue || formatNumber;
  const domain = valueDomain(numericValues(products, getValue), step);
  let bins = buildHistogram(numericValues(products, getValue), domain, step);
  const selected = { min: domain.min, max: domain.max };
  const label = (value) => formatBound(value, format, domain, copy);

  minSlider.min = domain.min;
  minSlider.max = domain.max;
  maxSlider.min = domain.min;
  maxSlider.max = domain.max;
  minSlider.step = step;
  maxSlider.step = step;
  minSlider.setAttribute('aria-label', copy.min || 'Min');
  maxSlider.setAttribute('aria-label', copy.max || 'Max');

  const isOver = (value) => value >= domain.max;

  const isAny = () => selected.min <= domain.min && isOver(selected.max);

  const getRange = () => {
    if (isAny()) return { min: null, max: null };
    return {
      min: isOver(selected.min) ? domain.lastRegular : selected.min,
      max: isOver(selected.max) ? null : selected.max,
    };
  };

  const isBinSelected = (bin) => {
    if (bin.over) return isOver(selected.max) && selected.min <= bin.start;
    return bin.start <= selected.max && bin.end > selected.min;
  };

  const sync = (emit = true) => {
    selected.min = snapValue(selected.min, domain, step);
    selected.max = snapValue(selected.max, domain, step);
    if (selected.min > selected.max) selected.min = selected.max;
    minSlider.value = selected.min;
    maxSlider.value = selected.max;
    minInput.value = label(selected.min);
    maxInput.value = label(selected.max);
    const span = domain.max - domain.min || 1;
    const start = ((selected.min - domain.min) / span) * 100;
    const end = ((selected.max - domain.min) / span) * 100;
    if (railActive) {
      railActive.style.left = `${start}%`;
      railActive.style.width = `${Math.max(0, end - start)}%`;
    }
    minSlider.style.zIndex = selected.min > domain.min + span / 2 ? 3 : 2;
    maxSlider.style.zIndex = selected.max < domain.min + span / 2 ? 3 : 2;
    if (histogramEl) {
      [...histogramEl.children].forEach((bar, index) => {
        const bin = bins[index];
        bar.classList.toggle('is-selected', !!(bin && isBinSelected(bin)));
      });
    }
    if (valueEl) {
      if (isAny()) valueEl.textContent = copy.any || 'Any';
      else if (isOver(selected.min) && isOver(selected.max)) {
        valueEl.textContent = label(selected.max);
      } else {
        valueEl.textContent = `${label(selected.min)} – ${label(selected.max)}`;
      }
    }
    if (emit) onChange();
  };

  const paintHistogram = () => {
    histogramEl.replaceChildren();
    bins.forEach((bin) => {
      const bar = document.createElement('span');
      bar.className = 'range-histogram-bar';
      bar.classList.toggle('is-selected', isBinSelected(bin));
      bar.style.height = `${Math.max(bin.ratio * 100, bin.ratio ? 8 : 0)}%`;
      histogramEl.append(bar);
    });
  };

  const updateHistogram = (subset) => {
    bins = buildHistogram(numericValues(subset, getValue), domain, step);
    paintHistogram();
  };

  paintHistogram();

  const openPanel = () => {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };

  const closePanel = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
    }
  });

  minSlider.addEventListener('input', () => {
    selected.min = Math.min(Number(minSlider.value), selected.max);
    sync();
  });
  maxSlider.addEventListener('input', () => {
    selected.max = Math.max(Number(maxSlider.value), selected.min);
    sync();
  });

  const commitInput = (which) => {
    const parsed = parseBound(which === 'min' ? minInput.value : maxInput.value, domain);
    if (Number.isNaN(parsed)) {
      sync(false);
      return;
    }
    if (which === 'min') {
      selected.min = Math.min(snapValue(parsed, domain, step), selected.max);
    } else {
      selected.max = Math.max(snapValue(parsed, domain, step), selected.min);
    }
    sync();
  };

  minInput.addEventListener('change', () => commitInput('min'));
  maxInput.addEventListener('change', () => commitInput('max'));
  minInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput('min');
    }
  });
  maxInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput('max');
    }
  });

  document.addEventListener('click', (event) => {
    if (field.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  sync(false);
  return { getRange, updateHistogram };
}

/**
 * Decorates the equipment search form widget.
 * @param {Element} widget The widget element
 */
export default async function decorate(widget) {
  const copy = await loadCopy(import.meta.url);
  hydrateCopy(widget, copy);

  const form = widget.querySelector('form');
  if (!form) return;

  const countEl = form.querySelector('.count');
  const input = form.querySelector('#equipment-query');
  const products = await loadProducts();
  const hoursField = form.querySelector('.hours-field');
  const priceField = form.querySelector('.price-field');
  let hoursRange = { min: null, max: null };
  let priceRange = { min: null, max: null };
  let hoursControl;
  let priceControl;

  const applyFilters = () => {
    const query = form.querySelector('#equipment-query')?.value || '';
    hoursControl?.updateHistogram(filterProducts(products, {
      q: query,
      hoursMin: null,
      hoursMax: null,
      priceMin: priceRange.min,
      priceMax: priceRange.max,
    }));
    priceControl?.updateHistogram(filterProducts(products, {
      q: query,
      hoursMin: hoursRange.min,
      hoursMax: hoursRange.max,
      priceMin: null,
      priceMax: null,
    }));
    const matches = filterProducts(products, {
      q: query,
      hoursMin: hoursRange.min,
      hoursMax: hoursRange.max,
      priceMin: priceRange.min,
      priceMax: priceRange.max,
    });
    if (countEl) countEl.textContent = String(matches.length);
    return matches;
  };

  if (hoursField) {
    hoursControl = attachRangeFilter(hoursField, {
      products,
      copy,
      step: HOURS_STEP,
      getValue: (item) => item.hours,
      formatValue: formatNumber,
      onChange: () => {
        hoursRange = hoursControl.getRange();
        applyFilters();
      },
    });
    hoursRange = hoursControl.getRange();
  }

  if (priceField) {
    priceControl = attachRangeFilter(priceField, {
      products,
      copy,
      step: PRICE_STEP,
      getValue: (item) => item.price,
      formatValue: formatPrice,
      onChange: () => {
        priceRange = priceControl.getRange();
        applyFilters();
      },
    });
    priceRange = priceControl.getRange();
  }

  form.addEventListener('input', applyFilters);
  form.addEventListener('change', applyFilters);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });

  if (input) {
    attachSuggestions(input, {
      products,
      copy,
      onPickQuery: applyFilters,
    });
  }

  applyFilters();
}
