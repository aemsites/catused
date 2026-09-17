import { loadCSS } from './aem.js';

const TICK_MS = 60;

/**
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * @param {HTMLElement} col
 * @param {number} digit
 * @param {string} [delay]
 */
function setStrip(col, digit, delay) {
  const strip = col.querySelector('.odometer-strip');
  if (!strip) return;
  if (delay != null) strip.style.transitionDelay = delay;
  strip.style.transform = `translateY(${-digit}em)`;
}

/**
 * @param {number} digit
 * @returns {HTMLElement}
 */
function digitColumn(digit) {
  const col = document.createElement('span');
  col.className = 'odometer-digit';
  const strip = document.createElement('span');
  strip.className = 'odometer-strip';
  for (let i = 0; i < 10; i += 1) {
    const tick = document.createElement('span');
    tick.className = 'odometer-tick';
    tick.textContent = String(i);
    strip.append(tick);
  }
  col.append(strip);
  setStrip(col, digit, '0ms');
  return col;
}

/**
 * @param {{ type: string, value: string|number }} token
 * @returns {HTMLElement}
 */
function tokenNode(token) {
  if (token.type === 'digit') return digitColumn(0);
  const sep = document.createElement('span');
  sep.className = 'odometer-sep';
  sep.textContent = String(token.value);
  return sep;
}

/**
 * @param {string} formatted
 * @returns {Array<{ type: string, value: string|number }>}
 */
function tokensOf(formatted) {
  return [...String(formatted)].map((ch) => (
    /\d/.test(ch) ? { type: 'digit', value: Number(ch) } : { type: 'sep', value: ch }
  ));
}

/**
 * Updates digit reels in place so CSS transform transitions can run.
 * @param {HTMLElement} reel
 * @param {string} formatted
 */
function paintReel(reel, formatted) {
  const next = tokensOf(formatted);
  const created = new Set();

  while (reel.children.length > next.length) {
    reel.firstElementChild.remove();
  }

  const missing = next.length - reel.children.length;
  for (let i = missing - 1; i >= 0; i -= 1) {
    const node = tokenNode(next[i]);
    reel.insertBefore(node, reel.firstElementChild);
    created.add(node);
  }

  next.forEach((token, i) => {
    const delay = `${(next.length - 1 - i) * TICK_MS}ms`;
    let node = reel.children[i];
    if (token.type === 'digit') {
      if (!node.classList.contains('odometer-digit')) {
        const col = digitColumn(0);
        node.replaceWith(col);
        node = col;
        created.add(node);
      }
      if (created.has(node)) {
        node.querySelector('.odometer-strip').style.transitionDelay = delay;
      } else {
        setStrip(node, token.value, delay);
      }
      return;
    }
    if (!node.classList.contains('odometer-sep')) {
      const sep = document.createElement('span');
      sep.className = 'odometer-sep';
      node.replaceWith(sep);
      node = sep;
    }
    node.textContent = String(token.value);
  });

  if (!created.size) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.forEach((token, i) => {
        const node = reel.children[i];
        if (token.type === 'digit' && created.has(node)) {
          setStrip(node, token.value);
        }
      });
    });
  });
}

/**
 * Renders a rolling odometer into `el` for `value`.
 * @param {HTMLElement} el
 * @param {number} value
 * @param {Object} [opts]
 * @param {Function} [opts.format]
 * @param {string} [opts.prefix]
 * @param {string} [opts.suffix]
 */
export function setOdometer(el, value, opts = {}) {
  if (!el) return;
  const count = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  const format = opts.format || String;
  const prefix = opts.prefix || '';
  const suffix = opts.suffix || '';
  const formatted = format(count);
  const label = `${prefix}${formatted}${suffix}`;
  const signature = `${count}\0${label}`;
  if (el.dataset.odometer === signature) return;
  el.dataset.odometer = signature;
  el.setAttribute('aria-label', label);

  if (prefersReducedMotion()) {
    el.textContent = label;
    return;
  }

  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/product-search.css`);
  el.classList.add('odometer-host');

  let prefixEl = el.querySelector(':scope > .odometer-prefix');
  let reel = el.querySelector(':scope > .odometer');
  let suffixEl = el.querySelector(':scope > .odometer-suffix');
  if (!reel) {
    el.replaceChildren();
    prefixEl = document.createElement('span');
    prefixEl.className = 'odometer-prefix';
    reel = document.createElement('span');
    reel.className = 'odometer';
    reel.setAttribute('aria-hidden', 'true');
    suffixEl = document.createElement('span');
    suffixEl.className = 'odometer-suffix';
    el.append(prefixEl, reel, suffixEl);
  }

  prefixEl.textContent = prefix.trim();
  suffixEl.textContent = suffix.trim();
  prefixEl.hidden = !prefixEl.textContent;
  suffixEl.hidden = !suffixEl.textContent;
  paintReel(reel, formatted);
}

/**
 * Updates a copy template like `{count} results` with a rolling number.
 * @param {HTMLElement} el
 * @param {number} count
 * @param {string} template
 * @param {Function} [format]
 */
export function setOdometerLabel(el, count, template, format = String) {
  const formatted = format(count);
  const label = (template || '{count}').replace('{count}', formatted);
  const at = label.indexOf(formatted);
  const prefix = at === -1 ? '' : label.slice(0, at);
  const suffix = at === -1 ? label : label.slice(at + formatted.length);
  setOdometer(el, count, { format, prefix, suffix });
}
