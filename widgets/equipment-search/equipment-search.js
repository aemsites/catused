import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';
import { loadCSS } from '../../scripts/aem.js';
import {
  HOURS_CAP,
  HOURS_STEP,
  PRICE_CAP_USD,
  PRICE_STEP,
  filterProducts,
  formatNumber,
  formatPrice,
  loadCurrencyRates,
  loadProducts,
  subscribeProducts,
  plpSearchUrl,
  priceUsd,
} from '../../scripts/product-index.js';
import attachRangeFilter from '../../scripts/range-filter.js';
import attachSuggestions from '../../scripts/suggestions.js';
import { setOdometer } from '../../scripts/odometer.js';

/**
 * Decorates the equipment search form widget.
 * @param {Element} widget The widget element
 */
export default async function decorate(widget) {
  await loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-search.css`);
  const [copy, rates] = await Promise.all([
    loadCopy(import.meta.url),
    loadCurrencyRates(),
  ]);
  const products = loadProducts();
  hydrateCopy(widget, copy);

  const form = widget.querySelector('form');
  if (!form) return;

  const countEl = form.querySelector('.count');
  const input = form.querySelector('#equipment-query');
  const hoursField = form.querySelector('.hours-field');
  const priceField = form.querySelector('.price-field');
  let hoursRange = { min: null, max: null };
  let priceRange = { min: null, max: null };
  let hoursControl;
  let priceControl;
  const usdPrice = (item) => priceUsd(item, rates);

  const applyFilters = () => {
    const query = form.querySelector('#equipment-query')?.value || '';
    const shared = {
      q: query,
      hoursMin: hoursRange.min,
      hoursMax: hoursRange.max,
      priceMin: priceRange.min,
      priceMax: priceRange.max,
      rates,
    };
    hoursControl?.updateHistogram(filterProducts(products, {
      ...shared,
      hoursMin: null,
      hoursMax: null,
    }));
    priceControl?.updateHistogram(filterProducts(products, {
      ...shared,
      priceMin: null,
      priceMax: null,
    }));
    const matches = filterProducts(products, shared);
    setOdometer(countEl, matches.length, { format: formatNumber });
    return matches;
  };

  if (hoursField) {
    hoursControl = attachRangeFilter(hoursField, {
      products,
      copy,
      step: HOURS_STEP,
      cap: HOURS_CAP,
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
      cap: PRICE_CAP_USD,
      getValue: usdPrice,
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
    window.location.assign(plpSearchUrl('/used-equipment', {
      q: input?.value || '',
      hoursMin: hoursRange.min,
      hoursMax: hoursRange.max,
      priceMin: priceRange.min,
      priceMax: priceRange.max,
    }));
  });

  if (input) {
    attachSuggestions(input, {
      products,
      copy,
      onPickQuery: applyFilters,
    });
  }

  subscribeProducts(applyFilters);
  applyFilters();
}
