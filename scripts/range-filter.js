import { loadCSS } from './aem.js';
import { formatBound, formatNumber, parseBound } from './product-index.js';

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
 * Largest number in a list without spreading (spread blows the stack on big arrays).
 * @param {number[]} values
 * @param {number} [fallback]
 * @returns {number}
 */
function maxOf(values, fallback = 0) {
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
 * @returns {{ min: number, max: number, lastRegular: number }}
 */
function valueDomain(values, step, cap, origin = 0, over = true) {
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
 * Builds histogram bins in step-sized buckets; the last bin is unbounded when
 * the domain has an over tick.
 * @param {number[]} values
 * @param {{ min: number, max: number, lastRegular: number, over: boolean }} domain
 * @param {number} step
 * @returns {Array<{ start: number, end: number, over: boolean, ratio: number }>}
 */
function buildHistogram(values, domain, step) {
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
      end: unbounded ? Infinity : start + step,
      over: unbounded,
      ratio: count / peak,
    };
  });
}

/**
 * Dual-handle range, histogram, and min/max fields.
 * @param {Element} field
 * @param {Object} opts
 * @returns {{ getRange: Function, setRange: Function, updateHistogram: Function }}
 */
export default function attachRangeFilter(field, {
  products, copy, onChange, getValue, step, formatValue, cap, inline, initial,
  origin = 0, over = true,
}) {
  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-search.css`);

  field.classList.add('range-filter');
  if (inline) field.classList.add('is-inline');

  const trigger = field.querySelector('.range-trigger');
  const valueEl = field.querySelector('.range-trigger-value');
  const panel = field.querySelector('.range-panel');
  const histogramEl = field.querySelector('.range-histogram');
  const railActive = field.querySelector('.range-rail-active');
  const minSlider = field.querySelector('.range-thumb-min');
  const maxSlider = field.querySelector('.range-thumb-max');
  const minInput = field.querySelector('.range-min-input');
  const maxInput = field.querySelector('.range-max-input');
  const empty = {
    getRange: () => ({ min: null, max: null }),
    setRange: () => {},
    updateHistogram: () => {},
  };
  if (!panel || !minSlider || !maxSlider || !minInput || !maxInput) return empty;
  if (!inline && !trigger) return empty;

  const format = formatValue || formatNumber;
  const domain = valueDomain(numericValues(products, getValue), step, cap, origin, over);
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

  const isOver = (value) => (over ? value >= domain.max : value >= domain.lastRegular);
  const isAny = () => selected.min <= domain.min && isOver(selected.max);

  const getRange = () => {
    if (isAny()) return { min: null, max: null };
    let minBound = selected.min;
    if (selected.min <= domain.min) minBound = null;
    else if (isOver(selected.min)) minBound = domain.lastRegular;
    return {
      min: minBound,
      max: isOver(selected.max) ? null : selected.max,
    };
  };

  const isBinSelected = (bin) => {
    if (bin.over) return isOver(selected.max) && selected.min <= bin.start;
    return bin.start <= selected.max && bin.end > selected.min;
  };

  const applyInitial = () => {
    if (!initial) return;
    if (initial.min != null) {
      selected.min = snapValue(initial.min, domain, step);
    }
    if (Object.prototype.hasOwnProperty.call(initial, 'max')) {
      selected.max = initial.max == null
        ? domain.max
        : snapValue(initial.max, domain, step);
    }
    if (selected.min > selected.max) selected.min = selected.max;
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
    if (!histogramEl) return;
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

  const setRange = ({ min = null, max = null } = {}) => {
    selected.min = min == null ? domain.min : snapValue(min, domain, step);
    selected.max = max == null ? domain.max : snapValue(max, domain, step);
    sync();
  };

  paintHistogram();

  if (!inline && trigger) {
    const closePanel = () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    const openPanel = () => {
      const root = field.closest('form') || field.parentElement;
      root?.querySelectorAll('.range-panel').forEach((other) => {
        if (other === panel) return;
        other.hidden = true;
        other.closest('.field')
          ?.querySelector('.range-trigger')
          ?.setAttribute('aria-expanded', 'false');
      });
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
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
  } else {
    panel.hidden = false;
  }

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

  applyInitial();
  sync(false);
  return { getRange, setRange, updateHistogram };
}
