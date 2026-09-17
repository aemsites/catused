import {
  add, icon, MONEY, NUM,
} from './pdp-utils.js';
import { addCertifiedBadge } from './pdp-product.js';

/** Inspection categories shown before the "View All" reveal. */
const REPORT_PREVIEW = 5;

/** Maps a condition grade bucket to its badge icon. */
const GRADE_ICON = { ok: 'check', warn: 'info', bad: 'warn' };

/**
 * MOCK: headline stats are not in the Product Bus feed.
 * @returns {HTMLElement}
 */
export function buildStats() {
  const section = document.createElement('section');
  section.className = 'pdp-stats';

  [
    ['XXX un', 'Gross power'],
    ['XXX un', 'Rated Operating Capacities - 35% tipping load'],
    ['XXX un', 'Operating weight'],
  ].forEach(([value, label]) => {
    const stat = add('div', 'pdp-stat', section);
    add('span', 'pdp-stat-value', stat, value);
    add('span', 'pdp-stat-label', stat, label);
  });

  return section;
}

/**
 * Equipment specifications accordion.
 *
 * MOCK: group contents. The feed carries no structured specifications, so the
 * groups render a placeholder until it does.
 *
 * @returns {HTMLElement}
 */
export function buildSpecifications() {
  const section = document.createElement('section');
  section.className = 'pdp-card pdp-specs-card';
  add('h2', 'pdp-card-title', section, 'Equipment Specifications');

  const accordion = add('div', 'pdp-accordion', section);
  [
    'Engine', 'Operating Specifications', 'Weights', 'Dimensions', 'Cab',
    'Service Refill Capacities', 'Hydraulic System', 'Power Train', 'Noise Level',
    'Air Conditioning System',
  ].forEach((name) => {
    const item = add('details', 'pdp-accordion-item', accordion);
    const summary = add('summary', 'pdp-accordion-summary', item);
    add('span', null, summary, name);
    summary.append(icon('chevron', 'pdp-accordion-icon'));

    const body = add('div', 'pdp-accordion-body', item);
    add('p', 'pdp-muted', body, 'Specification data coming soon.');
  });

  const all = add('a', 'pdp-more pdp-more-right', section, 'All Specs');
  all.href = '#specs';
  all.append(icon('arrow'));

  return section;
}

/**
 * One details panel with a "show more" toggle.
 * @param {Element} parent
 * @param {string} title
 * @param {string[]} items
 */
function addDetailPanel(parent, title, items) {
  const VISIBLE = 5;
  const panel = add('div', 'pdp-detail-panel', parent);
  add('h3', 'pdp-detail-title', panel, title);

  items.forEach((text, i) => {
    add('p', `pdp-detail-item${i >= VISIBLE ? ' is-hidden' : ''}`, panel, text);
  });

  const hidden = Math.max(items.length - VISIBLE, 0);
  if (!hidden) return;

  const more = add('button', 'pdp-link pdp-detail-more', panel, `Show ${hidden} more`);
  more.type = 'button';
  more.prepend(icon('chevron', 'pdp-rot'));
}

/**
 * Details panels.
 *
 * Accessories are real: the pipeline renders the product `description`, which
 * for this feed is the dealer's option list.
 *
 * @param {string[]} accessories
 * @returns {HTMLElement}
 */
export function buildDetails(accessories = []) {
  const section = document.createElement('section');
  section.className = 'pdp-card pdp-details-card';
  add('h2', 'pdp-card-title', section, 'Details');

  addDetailPanel(section, 'Accessories', accessories);
  // MOCK: no feed source for this list yet.
  addDetailPanel(section, 'Additional Information', Array(5).fill('Detail Item'));

  return section;
}

/**
 * Grade buckets for one inspection category.
 * @param {string} value
 * @returns {[string, number][]}
 */
function gradesFor(value) {
  if (value === 'Good') return [['ok', 3]];
  if (value === 'Fair') return [['ok', 1], ['warn', 1], ['bad', 1]];
  return [['warn', 1], ['bad', 1]];
}

/**
 * Condition report, driven by the feed's inspection summary.
 * @param {object} custom
 * @param {string} title
 * @returns {HTMLElement}
 */
/**
 * Cat AI Assistant summary panel.
 *
 * Year, hours and the overall rating are real feed values.
 * MOCK: the surrounding narrative and the three bullets are generated copy.
 *
 * @param {object} custom
 * @param {string} title
 * @returns {HTMLElement}
 */
function buildAssistant(custom, title) {
  const hours = custom.serviceMeter?.value;
  const assistant = document.createElement('div');
  assistant.className = 'pdp-assistant';

  const head = add('div', 'pdp-assistant-head', assistant);
  add('span', 'pdp-assistant-mark', head).setAttribute('aria-hidden', 'true');
  add('span', 'pdp-assistant-name', head, 'Cat AI Assistant');

  add('p', 'pdp-assistant-copy', assistant, `This ${custom.year ?? ''} ${title} reflects strong system performance, a clean cab, and only light cosmetic wear.${
    Number.isFinite(hours) ? ` With ${NUM.format(hours)} hours and a healthy undercarriage,` : ''
  } it's a dependable, work-ready unit.`);

  return assistant;
}

/**
 * The three verification bullets shown alongside the inline report.
 * MOCK: not feed data.
 * @param {object} custom
 * @param {HTMLElement} assistant
 */
function addAssistantDetail(custom, assistant) {
  const bottomLine = add('p', 'pdp-assistant-copy', assistant, 'The bottom line: ');
  add('strong', null, bottomLine, `${custom.condition?.rating === 'Good' ? 'Strong' : 'Fair'} overall condition with no major cosmetic or mechanical concerns.`);

  const list = add('ul', 'pdp-assistant-list', assistant);
  [
    'Inspection verified proper performance across all major systems',
    'Cab, gauges, and operator station are clean and fully operational',
    'Hydraulic, electrical, and cooling systems performing normally',
  ].forEach((text) => {
    const item = add('li', null, list, text);
    item.prepend(icon('check', 'pdp-tick'));
  });
}

/**
 * Three-dot condition scale. Good fills all three, Fair two, Poor one.
 * @param {Element} parent
 * @param {number} filled
 */
function addDotScale(parent, filled) {
  const scale = add('span', 'pdp-scale', parent);
  [0, 1, 2].forEach((i) => {
    add('span', `pdp-scale-dot${i < filled ? ' is-filled' : ''}`, scale);
  });
}

/** Grade -> number of filled dots. */
const GRADE_DOTS = { Good: 3, Fair: 2, Poor: 1 };

/**
 * Per-item detail for one inspection category.
 *
 * Undercarriage is real: the feed carries per-component wear measurements.
 * MOCK: every other category was collapsed to a single worst-grade during
 * ingest, so its line items are placeholders until the feed carries them.
 *
 * @param {string} name
 * @param {string} value
 * @param {object} custom
 * @returns {{ label: string, copy: string, dots: number }[]}
 */
function detailItems(name, value, custom) {
  const wear = custom.condition?.undercarriageWear ?? [];
  if (name.includes('UNDERCARRIAGE') && wear.length) {
    return wear.slice(0, 6).map((item) => {
      const worn = item.left?.percentWorn ?? item.right?.percentWorn ?? 0;
      return {
        label: item.component,
        copy: `${worn}% worn. Left ${item.left?.measurement ?? '-'}, right ${item.right?.measurement ?? '-'}.`,
        dots: (worn < 30 && 3) || (worn < 60 && 2) || 1,
      };
    });
  }

  return ['Radiator Grill & Shroud', 'Steps/Ladder', 'Paint'].map((label) => ({
    label,
    copy: 'Sample text about category and its details would go here.',
    dots: GRADE_DOTS[value] ?? 2,
  }));
}

/**
 * Appends one expandable inspection row.
 *
 * Built as `<details>` so disclosure state, keyboard operation and the
 * expanded/collapsed semantics come from the platform.
 *
 * @param {Element} parent
 * @param {string} name
 * @param {string} value
 * @param {object} custom
 * @param {HTMLElement[]} pictures
 */
function addReportRow(parent, name, value, custom, pictures = []) {
  const row = add('details', 'pdp-report-row', parent);
  const summary = add('summary', 'pdp-report-summary', row);
  add('span', 'pdp-report-name', summary, name);

  const grades = add('span', 'pdp-report-grades', summary);
  gradesFor(value).forEach(([kind, count]) => {
    const grade = add('span', `pdp-grade pdp-grade-${kind}`, grades, String(count));
    grade.prepend(icon(GRADE_ICON[kind]));
  });
  summary.append(icon('chevron', 'pdp-report-chevron'));

  const body = add('div', 'pdp-report-body', row);
  detailItems(name, value, custom).forEach((item) => {
    const entry = add('div', 'pdp-report-item', body);
    const head = add('div', 'pdp-report-item-head', entry);
    add('span', 'pdp-report-item-name', head, item.label);
    addDotScale(head, item.dots);
    add('p', 'pdp-report-item-copy', entry, item.copy);
  });

  if (!pictures.length) return;
  add('h4', 'pdp-report-images-title', body, 'Images');
  const strip = add('div', 'pdp-report-images', body);
  pictures.slice(0, 3).forEach((picture) => {
    const clone = picture.cloneNode(true);
    const img = clone.querySelector('img');
    if (img) {
      img.setAttribute('loading', 'lazy');
      img.removeAttribute('fetchpriority');
    }
    add('div', 'pdp-report-image', strip).append(clone);
  });
}

/**
 * Full-screen condition report, opened from the mobile "Full Report" link.
 *
 * A native `<dialog>` so focus trapping, Escape-to-close and inertness of the
 * page behind it come from the platform rather than hand-rolled JavaScript.
 *
 * @param {object} custom
 * @param {string} title
 * @returns {HTMLElement}
 */
function buildConditionDialog(custom, title, pictures) {
  const dialog = document.createElement('dialog');
  dialog.className = 'pdp-dialog';
  dialog.setAttribute('aria-label', 'Condition Report');

  const head = add('div', 'pdp-dialog-head', dialog);
  add('h2', 'pdp-dialog-title', head, 'Condition Report');
  const close = add('button', 'pdp-dialog-close', head);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close condition report');
  close.append(icon('close'));

  const body = add('div', 'pdp-dialog-body', dialog);
  body.append(buildAssistant(custom, title));

  const entries = Object.entries(custom.condition?.inspectionSummary ?? {});
  const rows = add('div', 'pdp-dialog-rows', body);
  entries.forEach(([name, value], i) => {
    addReportRow(rows, name, value, custom, pictures);
    if (i >= REPORT_PREVIEW) rows.lastElementChild.classList.add('is-hidden');
  });

  if (entries.length > REPORT_PREVIEW) {
    const all = add('button', 'pdp-btn pdp-btn-secondary pdp-dialog-all', body, 'View All');
    all.type = 'button';
  }

  return dialog;
}

/**
 * Condition report, driven by the feed's inspection summary.
 * @param {object} custom
 * @param {string} title
 * @returns {HTMLElement}
 */
export function buildCondition(custom, title, pictures = []) {
  const section = document.createElement('section');
  section.className = 'pdp-card pdp-condition';
  add('h2', 'pdp-card-title pdp-card-title-rule', section, 'Condition Report');

  const grid = add('div', 'pdp-condition-grid', section);
  const assistant = buildAssistant(custom, title);
  addAssistantDetail(custom, assistant);
  grid.append(assistant);

  const entries = Object.entries(custom.condition?.inspectionSummary ?? {});
  const report = add('div', 'pdp-report', grid);
  add('h3', 'pdp-report-title', report, 'Full Report');
  entries.slice(0, 5).forEach(([name, value]) => {
    addReportRow(report, name, value, custom, pictures);
  });

  if (entries.length > 5) {
    const more = add('a', 'pdp-link pdp-report-more', report, `View ${entries.length - 5} More`);
    more.href = '#report';
  }

  // Mobile collapses the itemised report behind a link that opens the dialog.
  const link = add('button', 'pdp-more pdp-more-right pdp-condition-link', section, 'Full Report');
  link.type = 'button';
  link.append(icon('arrow'));

  section.append(buildConditionDialog(custom, title, pictures));

  return section;
}

/**
 * MOCK: similar listings are not in the feed; the product index would supply
 * these. Reuses this product's own photography so the row reads realistically.
 *
 * @param {string} title
 * @param {HTMLElement[]} pictures
 * @returns {HTMLElement}
 */
export function buildSimilar(title, pictures = []) {
  const section = document.createElement('section');
  section.className = 'pdp-similar';
  add('h2', 'pdp-section-title', section, 'Similar Listings');

  const grid = add('div', 'pdp-listing-grid', section);

  [0, 1, 2, 3].forEach((index) => {
    const listing = add('article', 'pdp-listing', grid);

    const media = add('div', 'pdp-listing-media', listing);
    const source = pictures[index % Math.max(pictures.length, 1)];
    if (source) {
      const clone = source.cloneNode(true);
      const img = clone.querySelector('img');
      if (img) {
        img.setAttribute('loading', 'lazy');
        img.removeAttribute('fetchpriority');
      }
      media.append(clone);
    }
    add('span', 'pdp-listing-year', media, '2015');
    addCertifiedBadge(media, 'pdp-badge-sm');

    const body = add('div', 'pdp-listing-body', listing);
    const head = add('div', 'pdp-listing-head', body);
    add('span', 'pdp-listing-family', head, 'Compact Track Loader');
    const save = add('button', 'pdp-save pdp-save-sm', head);
    save.type = 'button';
    save.setAttribute('aria-label', 'Save listing');
    save.setAttribute('aria-pressed', 'false');
    save.append(icon('heart'));

    add('h3', 'pdp-listing-title', body, title);

    const meta = add('p', 'pdp-listing-meta', body);
    add('span', null, meta, 'Houston, TX');
    add('span', 'pdp-pill', meta, '2,500 hours');

    const specs = add('div', 'pdp-listing-specs', body);
    [['ROPS', 'Cab'], ['Hydraulic Flow', 'Standard Flow']].forEach(([label, value]) => {
      const spec = add('div', null, specs);
      add('span', 'pdp-spec-label', spec, label);
      add('span', 'pdp-spec-value', spec, value);
    });

    const price = add('div', 'pdp-listing-price', body);
    add('span', 'pdp-spec-label', price, 'Base price');
    add('span', 'pdp-listing-amount', price, MONEY.format(79500));

    const details = add('button', 'pdp-btn pdp-btn-primary pdp-btn-sm', body, 'Details');
    details.type = 'button';
  });

  return section;
}

/**
 * Mobile-only sticky purchase bar.
 * @param {object} offer
 * @returns {HTMLElement}
 */
export function buildStickyBar(offer) {
  const bar = document.createElement('div');
  bar.className = 'pdp-sticky';

  const price = Number(offer.price);
  const column = add('div', 'pdp-sticky-price', bar);
  const amount = add('span', 'pdp-sticky-amount', column, Number.isFinite(price) ? `${MONEY.format(price)} USD` : 'Call for price');
  amount.append(icon('info', 'pdp-sticky-info'));
  add('span', 'pdp-sticky-label', column, 'Est. Total Price');

  const calc = add('a', 'pdp-link pdp-sticky-calc', column, 'Payment Calculator');
  calc.href = '#calculator';
  calc.append(icon('arrow'));

  const actions = add('div', 'pdp-sticky-actions', bar);
  const summary = add('button', 'pdp-btn pdp-btn-primary', actions, 'Continue to Summary');
  summary.type = 'button';
  const save = add('button', 'pdp-btn pdp-btn-secondary', actions, 'Save Selection');
  save.type = 'button';
  save.prepend(icon('bookmark'));

  return bar;
}
