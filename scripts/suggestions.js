import { loadCSS } from './aem.js';
import { filterProducts } from './product-index.js';

const SUGGESTIONS_DEBOUNCE_MS = 150;
const SUGGESTIONS_PREVIEW = 4;

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
  const equipment = filterProducts(products, { q: query });
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
export default function attachSuggestions(input, {
  products, copy, onPickQuery,
}) {
  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-search.css`);

  const anchor = input.closest('.suggestions-anchor')
    || input.closest('.field')
    || input.parentElement;
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
