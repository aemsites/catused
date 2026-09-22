import {
  add, icon, money, NUM,
} from './pdp-utils.js';
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

  // The feed does not carry a complete structured specification sheet, so there
  // is no "All Specs" destination to promise yet. Keep the in-context accordions
  // visible as an explicit coming-soon surface, but do not render a dead CTA.
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
    const missing = text === 'Missing from Export';
    add('p', `pdp-detail-item${missing ? ' pdp-detail-missing' : ''}${i >= VISIBLE ? ' is-hidden' : ''}`, panel, text);
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
 * The export currently has neither fitted accessories/compatibility nor an
 * additional-information payload. Keep the missing-source marker visible in
 * both panels during product review instead of relabelling dealer feature text
 * as accessories or showing fabricated Detail Item placeholders.
 *
 * @returns {HTMLElement}
 */
export function buildDetails() {
  const section = document.createElement('section');
  section.className = 'pdp-card pdp-details-card';
  add('h2', 'pdp-card-title', section, 'Details');

  addDetailPanel(section, 'Accessories', ['Missing from Export']);
  addDetailPanel(section, 'Additional Information', ['Missing from Export']);

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
  if (value === 'Poor') return [['warn', 1], ['bad', 1]];
  // Note-only sections such as TIRES or general remarks have no quality grade.
  return [];
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
 * Returns detailed inspection categories when the Product Bus entry has them,
 * with the legacy category->grade summary as a graceful fallback for entries
 * imported before the full report was added.
 *
 * @param {object} custom
 * @returns {{ name: string, grade?: string, items: object[] }[]}
 */
function inspectionCategories(custom) {
  const inspection = custom.condition?.inspection ?? [];
  if (inspection.length) return inspection;

  return Object.entries(custom.condition?.inspectionSummary ?? {})
    .map(([name, grade]) => ({ name, grade, items: [] }));
}

/**
 * Per-item detail for one inspection category.
 *
 * The full feed supplies item name, optional Good/Fair/Poor or Yes/No value,
 * and optional inspector note. Yes/No is deliberately not converted into a
 * quality grade: "Visible Oil Leaks: No" is good while "Cleaning Required:
 * Yes" is not, and the field name—not the boolean alone—carries that meaning.
 *
 * Undercarriage wear remains a fallback for legacy entries because it is held
 * separately from the inspection item list.
 *
 * @param {{ name: string, grade?: string, items: object[] }} category
 * @param {object} custom
 * @returns {{ label: string, copy?: string, value?: string, dots?: number }[]}
 */
function detailItems(category, custom) {
  if (category.items?.length) {
    return category.items.map((item) => ({
      label: item.name,
      ...(item.note ? { copy: item.note } : {}),
      ...(item.value ? { value: item.value } : {}),
      ...(GRADE_DOTS[item.value] ? { dots: GRADE_DOTS[item.value] } : {}),
    }));
  }

  const wear = custom.condition?.undercarriageWear ?? [];
  if (category.name.includes('UNDERCARRIAGE') && wear.length) {
    return wear.slice(0, 6).map((item) => {
      const worn = item.left?.percentWorn ?? item.right?.percentWorn ?? 0;
      return {
        label: item.component,
        copy: `${worn}% worn. Left ${item.left?.measurement ?? '-'}, right ${item.right?.measurement ?? '-'}.`,
        dots: (worn < 30 && 3) || (worn < 60 && 2) || 1,
      };
    });
  }

  return [];
}

/**
 * Photos that directly correspond to an inspection area.
 *
 * The feed does not associate arbitrary photos with arbitrary condition checks,
 * so evidence is deliberately limited to typed assets. Today that means an
 * ENGINE check can use an `engine` photo; generic exterior shots are never
 * reused as pretend evidence for paint, hydraulics, tyres, or other findings.
 *
 * @param {string} categoryName
 * @param {HTMLElement[]} pictures
 * @returns {HTMLElement[]}
 */
function conditionEvidence(categoryName, pictures) {
  const name = categoryName.toUpperCase();
  let roles = [];
  if (name.includes('ENGINE')) roles = ['engine'];
  else if (name.includes('UNDERCARRIAGE')) roles = ['undercarriage'];
  else if (name.includes('TIRE')) roles = ['tire'];

  if (!roles.length) return [];
  return pictures.filter((picture) => {
    const src = picture.querySelector('img')?.getAttribute('src') ?? '';
    return roles.some((role) => new RegExp(`_${role}(?:_\\d+)?\\.[a-z]+(?:\\?|$)`).test(src));
  });
}

/**
 * Appends one expandable inspection row.
 *
 * Built as `<details>` so disclosure state, keyboard operation and the
 * expanded/collapsed semantics come from the platform.
 *
 * @param {Element} parent
 * @param {{ name: string, grade?: string, items: object[] }} category
 * @param {object} custom
 * @param {HTMLElement[]} pictures
 */
function addReportRow(parent, category, custom, pictures = []) {
  const row = add('details', 'pdp-report-row', parent);
  const summary = add('summary', 'pdp-report-summary', row);
  add('span', 'pdp-report-name', summary, category.name);

  const grades = add('span', 'pdp-report-grades', summary);
  gradesFor(category.grade).forEach(([kind, count]) => {
    const grade = add('span', `pdp-grade pdp-grade-${kind}`, grades, String(count));
    grade.prepend(icon(GRADE_ICON[kind]));
  });
  summary.append(icon('chevron', 'pdp-report-chevron'));

  const body = add('div', 'pdp-report-body', row);

  // Keep full source-backed condition content in the initial rendered DOM. Search
  // crawlers do not expand custom controls, so creating checks only on <details>
  // toggle would make listing-specific inspection text undiscoverable.
  detailItems(category, custom).forEach((item) => {
    const entry = add('div', 'pdp-report-item', body);
    const head = add('div', 'pdp-report-item-head', entry);
    add('span', 'pdp-report-item-name', head, item.label);
    if (item.dots) addDotScale(head, item.dots);
    else if (item.value) add('span', 'pdp-report-item-value', head, item.value);
    if (item.copy) add('p', 'pdp-report-item-copy', entry, item.copy);
  });

  const evidence = conditionEvidence(category.name, pictures);
  if (!evidence.length) return;

  const media = add('div', 'pdp-report-evidence', body);
  evidence.forEach((picture) => {
    const clone = picture.cloneNode(true);
    add('div', 'pdp-report-evidence-image', media).append(clone);
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
 * @param {HTMLElement[]} pictures
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

  // This duplicates the desktop report for the mobile dialog, but keeps the
  // complete report in the rendered DOM without requiring a crawler click.
  const categories = inspectionCategories(custom);
  const rows = add('div', 'pdp-dialog-rows', body);
  categories.forEach((category, i) => {
    addReportRow(rows, category, custom, pictures);
    if (i >= REPORT_PREVIEW) rows.lastElementChild.classList.add('is-hidden');
  });

  if (categories.length > REPORT_PREVIEW) {
    const all = add('button', 'pdp-btn pdp-btn-secondary pdp-dialog-all', body, 'View All');
    all.type = 'button';
    all.addEventListener('click', () => {
      rows.querySelectorAll('.pdp-report-row.is-hidden')
        .forEach((row) => row.classList.remove('is-hidden'));
      all.remove();
    });
  }

  return dialog;
}

/**
 * Condition report, driven by the feed's inspection summary.
 * @param {object} custom
 * @param {string} title
 * @param {HTMLElement[]} [pictures]
 * @returns {HTMLElement|undefined}
 */
export function buildCondition(custom, title, pictures = []) {
  const categories = inspectionCategories(custom);
  // Do not show a title/CTA for the 65% of listings that have no actual report.
  if (!categories.length) return undefined;

  const section = document.createElement('section');
  section.className = 'pdp-card pdp-condition';
  add('h2', 'pdp-card-title pdp-card-title-rule', section, 'Condition Report');

  const grid = add('div', 'pdp-condition-grid', section);
  const assistant = buildAssistant(custom, title);
  addAssistantDetail(custom, assistant);
  grid.append(assistant);

  const report = add('div', 'pdp-report', grid);
  add('h3', 'pdp-report-title', report, 'Full Report');
  categories.forEach((category, i) => {
    addReportRow(report, category, custom, pictures);
    if (i >= REPORT_PREVIEW) report.lastElementChild.classList.add('is-hidden');
  });

  if (categories.length > REPORT_PREVIEW) {
    const more = add('button', 'pdp-link pdp-report-more', report, `View ${categories.length - REPORT_PREVIEW} More`);
    more.type = 'button';
    more.addEventListener('click', () => {
      const expanded = more.dataset.expanded === 'true';
      report.querySelectorAll('.pdp-report-row.is-hidden').forEach((row) => {
        row.classList.toggle('is-hidden', expanded);
      });
      more.dataset.expanded = String(!expanded);
      more.textContent = expanded ? `View ${categories.length - REPORT_PREVIEW} More` : 'Show less';
    });
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
export function buildSimilar(title, pictures, currency) {
  const photos = pictures ?? [];
  const section = document.createElement('section');
  section.className = 'pdp-similar';
  add('h2', 'pdp-section-title', section, 'Similar Listings');

  const grid = add('div', 'pdp-listing-grid', section);

  [0, 1, 2, 3].forEach((index) => {
    const listing = add('article', 'pdp-listing', grid);

    const media = add('div', 'pdp-listing-media', listing);
    const source = photos[index % Math.max(photos.length, 1)];
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
    // Similar listings are still mocked; do not fabricate a certification badge.

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
    add('span', 'pdp-listing-amount', price, money(currency).format(79500));

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
  const currency = offer.priceCurrency;
  const formatted = Number.isFinite(price) ? money(currency).format(price) : '';
  const label = Number.isFinite(price)
    ? `${formatted}${currency && !formatted.includes(currency) ? ` ${currency}` : ''}`
    : 'Call for price';
  const column = add('div', 'pdp-sticky-price', bar);
  const amount = add('span', 'pdp-sticky-amount', column, label);
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
