import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';
import { loadCSS } from '../../scripts/aem.js';
import {
  HOURS_CAP,
  HOURS_STEP,
  PRICE_CAP_USD,
  PRICE_STEP,
  formatNumber,
  formatPrice,
  loadCurrencyRates,
  plpSearchUrl,
  watchCatalog,
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
  let catalog;

  const catalogSpec = () => ({
    q: form.querySelector('#equipment-query')?.value || '',
    hoursMin: hoursRange.min,
    hoursMax: hoursRange.max,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
    rates,
    pageSize: 0,
    histograms: ['hours', 'price'],
  });

  const applyFilters = () => {
    catalog?.update(catalogSpec());
  };

  if (hoursField) {
    hoursControl = attachRangeFilter(hoursField, {
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
      copy,
      step: PRICE_STEP,
      cap: PRICE_CAP_USD,
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
      copy,
      onPickQuery: applyFilters,
    });
  }

  catalog = watchCatalog(catalogSpec(), (result) => {
    if (result.histograms?.hours) hoursControl?.updateHistogram(result.histograms.hours);
    if (result.histograms?.price) priceControl?.updateHistogram(result.histograms.price);
    setOdometer(countEl, result.count || 0, { format: formatNumber });
  });
}
