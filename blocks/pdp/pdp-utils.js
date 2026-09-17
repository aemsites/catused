/**
 * Shared helpers for the product detail page.
 */

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat('en-US');

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Icon geometry, as element/attribute pairs rather than markup strings.
 *
 * `head.html` sets `require-trusted-types-for 'script'`, so assigning markup via
 * `innerHTML` would be routed through the Trusted Types policy. Building the
 * nodes avoids that entirely.
 *
 * @type {Record<string, [string, Record<string, string>][]>}
 */
const ICONS = {
  heart: [['path', { d: 'M12 21s-7.5-4.9-9.3-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.3 12c-1.8 4.1-9.3 9-9.3 9Z' }]],
  chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
  close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  arrow: [['path', { d: 'M5 12h14m-6-6 6 6-6 6' }]],
  check: [['path', { d: 'm5 13 4 4L19 7' }]],
  external: [['path', { d: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }]],
  phone: [['path', { d: 'M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 5.2 2 2 0 0 1 6 3Z' }]],
  bookmark: [['path', { d: 'M6 3h12v18l-6-4.5L6 21Z' }]],
  info: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    ['path', { d: 'M12 11v5M12 8h.01' }],
  ],
  warn: [
    ['path', { d: 'M12 4 2.5 20h19L12 4Z' }],
    ['path', { d: 'M12 10v4M12 17h.01' }],
  ],
};

/**
 * Builds an inline SVG icon.
 * @param {keyof ICONS} name
 * @param {string} [className]
 * @returns {SVGElement}
 */
export function icon(name, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);

  ICONS[name].forEach(([tag, attrs]) => {
    const shape = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, value));
    svg.append(shape);
  });

  return svg;
}

/**
 * Creates an element, optionally classed, texted and appended in one step.
 *
 * This is deliberately thin: it assigns properties and appends to a parent,
 * matching the imperative style used elsewhere in the project. It never nests,
 * so call sites stay flat and readable.
 *
 * @param {string} tag
 * @param {string} [className]
 * @param {Element} [parent] appended to this element when supplied.
 * @param {string} [text] textContent when supplied.
 * @returns {HTMLElement}
 */
export function add(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (parent) parent.append(node);
  return node;
}

/**
 * Reads the product payload out of the pipeline's JSON-LD.
 * @returns {{ jsonld: object, custom: object, offer: object }}
 */
export function readProduct() {
  let jsonld = {};
  try {
    const script = document.head.querySelector('script[type="application/ld+json"]');
    if (script) jsonld = JSON.parse(script.textContent);
  } catch {
    jsonld = {};
  }
  const offers = Array.isArray(jsonld.offers) ? jsonld.offers : [jsonld.offers];
  return { jsonld, custom: jsonld.custom ?? {}, offer: offers[0] ?? {} };
}

/**
 * Splits the pipeline's product name into an eyebrow and a title.
 *
 * The pipeline name is "2014 Cat 314ELCR Track Excavators"; the design shows the
 * family as an eyebrow and "CAT 314ELCR" as the title.
 *
 * @param {object} custom
 * @returns {{ eyebrow: string, title: string }}
 */
export function readTitle(custom) {
  const brand = (custom.manufacturer?.name ?? '').toUpperCase();
  const model = custom.model ?? '';
  return {
    eyebrow: custom.equipmentFamily?.name ?? '',
    title: [brand, model].filter(Boolean).join(' '),
  };
}

export { MONEY, NUM };
