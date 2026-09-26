import { formatListingPrice } from '../../scripts/locale.js';
import { addCertifiedBadge } from './pdp-product.js';
import {
  add, icon, NUM,
} from './pdp-utils.js';
/** Inspection categories shown before the "View All" reveal. */
const REPORT_PREVIEW = 5;

/** Maps a condition grade bucket to its badge icon. */
const GRADE_ICON = { ok: 'check', warn: 'info', bad: 'warn' };

/**
 * The feed joins a name and value with either " - " or ":". One listing uses
 * one of those. Whichever shows up in more entries is the separator for the
 * whole list; a tie stays with " - ".
 * @param {string[]} features
 * @returns {string}
 */
function featureSeparator(features) {
  let dashes = 0;
  let colons = 0;
  features.forEach((feature) => {
    const dashAt = feature.indexOf(' - ');
    const colonAt = feature.indexOf(':');
    if (dashAt === -1 && colonAt === -1) return;
    if (colonAt === -1 || (dashAt !== -1 && dashAt < colonAt)) dashes += 1;
    else colons += 1;
  });
  return colons > dashes ? ':' : ' - ';
}

/**
 * Splits one feature on the first occurrence of `separator`.
 * "Emissions Level - EPA - Tier4" keeps "EPA - Tier4" as the value.
 * @param {string} feature
 * @param {string} separator
 * @returns {[string, string]}
 */
function splitFeature(feature, separator) {
  const splitAt = feature.indexOf(separator);
  if (splitAt === -1) return [feature, ''];
  return [
    feature.slice(0, splitAt).trim(),
    feature.slice(splitAt + separator.length).trim(),
  ];
}

/**
 * Equipment specifications from the feed's `features` list.
 *
 * Entries are either a bare name ("Air Conditioner") or a name and value
 * joined by " - " or ":".
 *
 * @param {string[]} [features]
 * @returns {HTMLElement|null}
 */
export function buildSpecifications(features) {
  const entries = (Array.isArray(features) ? features : [])
    .map((feature) => String(feature ?? '').trim())
    .filter(Boolean);
  const separator = featureSeparator(entries);
  const rows = entries
    .map((feature) => splitFeature(feature, separator))
    .filter(([name]) => name);

  if (!rows.length) return null;

  const section = document.createElement('section');
  section.className = 'pdp-card pdp-specs-card';
  add('h2', 'pdp-card-title', section, 'Features');

  const list = add('div', 'pdp-features', section);
  rows.forEach(([name, value]) => {
    const row = add('div', 'pdp-feature', list);
    add('span', 'pdp-feature-name', row, name);
    if (value) add('span', 'pdp-feature-value', row, value);
  });

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
 * One similar-listing card from a product-index row.
 * @param {Element} grid
 * @param {object} item
 * @param {Object<string, number>} rates
 */
function addSimilarCard(grid, item, rates) {
  const href = item.url || '#';
  const title = item.title || item.sku || '';
  const place = [item.city, item.state].filter(Boolean).join(', ');
  const certification = item.certification === 'CCU' ? { code: 'CCU' } : undefined;
  const listing = add('article', 'pdp-listing', grid);

  const media = add('div', 'pdp-listing-media', listing);
  if (item.image) {
    const photo = add('a', null, media);
    photo.href = href;
    photo.tabIndex = -1;
    photo.setAttribute('aria-hidden', 'true');
    const img = add('img', null, photo);
    img.src = String(item.image).trim();
    img.alt = '';
    img.loading = 'lazy';
  }
  if (item.year) add('span', 'pdp-listing-year', media, String(item.year));
  addCertifiedBadge(media, certification, 'pdp-badge-sm');

  const body = add('div', 'pdp-listing-body', listing);
  const head = add('div', 'pdp-listing-head', body);
  if (item.product_type) add('span', 'pdp-listing-family', head, item.product_type);
  const save = add('button', 'pdp-save pdp-save-sm', head);
  save.type = 'button';
  save.setAttribute('aria-label', `Save ${title}`);
  save.setAttribute('aria-pressed', 'false');
  save.append(icon('heart'));

  const heading = add('h3', 'pdp-listing-title', body);
  const name = add('a', null, heading, title);
  name.href = href;

  const hours = Number(item.hours);
  const meta = add('p', 'pdp-listing-meta', body);
  if (place) add('span', null, meta, place);
  if (Number.isFinite(hours)) add('span', 'pdp-pill', meta, `${NUM.format(hours)} hours`);
  if (!meta.childElementCount) meta.remove();

  const price = add('div', 'pdp-listing-price', body);
  add('span', 'pdp-spec-label', price, 'Base price');
  const amount = Number(item.price);
  add('span', 'pdp-listing-amount', price, Number.isFinite(amount)
    ? formatListingPrice(amount, item.currency, rates)
    : 'Call for price');

  const details = add('a', 'pdp-btn pdp-btn-primary pdp-btn-sm', body, 'Details');
  details.href = href;
}

/**
 * Empty similar-listings row. Cards are filled once the product index returns
 * other machines in this category.
 * @param {Object<string, number>} rates
 * @returns {{ section: HTMLElement, show: (items: object[]) => void }}
 */
export function buildSimilar(rates) {
  const section = document.createElement('section');
  section.className = 'pdp-similar';
  section.hidden = true;
  add('h2', 'pdp-section-title', section, 'Similar Listings');
  const grid = add('div', 'pdp-listing-grid', section);

  return {
    section,
    show(items) {
      grid.replaceChildren();
      items.forEach((item) => addSimilarCard(grid, item, rates));
      section.hidden = items.length === 0;
    },
  };
}

/**
 * Mobile-only sticky purchase bar.
 * @param {object} offer
 * @returns {HTMLElement}
 */
export function buildStickyBar(offer, rates) {
  const bar = document.createElement('div');
  bar.className = 'pdp-sticky';

  const price = Number(offer.price);
  const label = Number.isFinite(price)
    ? formatListingPrice(price, offer.priceCurrency, rates)
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

  return bar;
}
