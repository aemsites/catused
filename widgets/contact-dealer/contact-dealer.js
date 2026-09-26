import { loadCSS } from '../../scripts/aem.js';
import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';

const HOURS = new Intl.NumberFormat('en-US');

/** @type {Promise<HTMLDialogElement>|undefined} */
let pending;

/**
 * @param {string} extension
 * @returns {string}
 */
function assetUrl(extension) {
  const path = new URL(import.meta.url).pathname.replace(/\.js$/, `.${extension}`);
  return `${(window.hlx && window.hlx.codeBasePath) || ''}${path}`;
}

/**
 * Product fields the form can show, read from the page JSON-LD.
 * @returns {object}
 */
function readListing() {
  let jsonld = {};
  try {
    const script = document.head.querySelector('script[type="application/ld+json"]');
    if (script) jsonld = JSON.parse(script.textContent);
  } catch {
    jsonld = {};
  }
  const custom = jsonld.custom ?? {};
  const images = Array.isArray(jsonld.image) ? jsonld.image : [jsonld.image];
  const brandName = (custom.manufacturer?.name ?? '').toUpperCase();
  const model = custom.model ?? '';
  const title = [brandName, model].filter(Boolean).join(' ');
  const hours = Number(custom.serviceMeter?.value);
  return {
    title,
    year: custom.year ? String(custom.year) : '',
    hours: Number.isFinite(hours) ? HOURS.format(hours) : '',
    image: images.find(Boolean) || '',
    certified: custom.condition?.certification?.code === 'CCU',
    dealer: custom.dealer?.name ?? '',
    brand: title,
    category: custom.equipmentFamily?.name ?? '',
    serial: custom.serialNumber ?? '',
    unit: custom.unitNumber ?? '',
    sku: jsonld.sku ? String(jsonld.sku) : '',
  };
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {Object} copy
 */
function fillCountries(dialog, copy) {
  const select = dialog.querySelector('select[name="country"]');
  if (!select || select.dataset.filled) return;
  const countries = Array.isArray(copy.countries) ? copy.countries : [];
  countries.forEach((country) => {
    if (!country?.name) return;
    const option = document.createElement('option');
    option.value = country.code || country.name;
    option.textContent = country.name;
    select.append(option);
  });
  select.dataset.filled = 'true';
}

/**
 * Page data wins when the product page passes it; JSON-LD fills anything left blank.
 * @param {object} [listing]
 * @returns {object}
 */
function mergeListing(listing) {
  const page = readListing();
  if (!listing) return page;
  const merged = { ...page };
  Object.entries(listing).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  });
  return merged;
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {object} [listing]
 */
function fillProduct(dialog, listing) {
  const product = mergeListing(listing);
  const hasProduct = Boolean(
    product.title || product.image || product.serial || product.unit || product.dealer,
  );
  const summary = dialog.querySelector('.summary');
  if (summary) summary.hidden = !hasProduct;

  const title = dialog.querySelector('.product-title');
  if (title) title.textContent = product.title;

  const year = dialog.querySelector('.year');
  if (year) {
    year.textContent = product.year;
    year.hidden = !product.year;
  }

  const hours = dialog.querySelector('.hours');
  const hoursValue = dialog.querySelector('.hours-value');
  if (hoursValue) hoursValue.textContent = product.hours;
  if (hours) hours.hidden = !product.hours;

  const photo = dialog.querySelector('.photo');
  if (photo) {
    if (product.image) {
      photo.src = product.image;
      photo.alt = product.title;
      photo.hidden = false;
    } else {
      photo.removeAttribute('src');
      photo.alt = '';
      photo.hidden = true;
    }
  }

  const badge = dialog.querySelector('.badge');
  if (badge) badge.hidden = !product.certified;

  const dealer = dialog.querySelector('.dealer');
  const dealerName = dialog.querySelector('.dealer-name');
  const logoName = dialog.querySelector('.logo-name');
  if (dealerName) dealerName.textContent = product.dealer;
  if (logoName) logoName.textContent = String(product.dealer || '').split(/\s+/)[0] || '';
  if (dealer) dealer.hidden = !product.dealer;

  [
    ['brand', product.brand],
    ['category', product.category],
    ['serial', product.serial],
    ['unit', product.unit],
  ].forEach(([key, value]) => {
    const row = dialog.querySelector(`[data-spec="${key}"]`);
    const valueEl = row?.querySelector('dd');
    if (valueEl) valueEl.textContent = value;
    if (row) row.hidden = !value;
  });

  const hidden = {
    sku: product.sku,
    productTitle: product.title,
    productUrl: window.location.href,
    dealer: product.dealer,
    brand: product.brand,
    category: product.category,
    serialNumber: product.serial,
    unitNumber: product.unit,
    year: product.year,
    hours: product.hours,
  };
  Object.entries(hidden).forEach(([name, value]) => {
    const input = dialog.querySelector(`input[name="${name}"]`);
    if (input) input.value = value ?? '';
  });
}

/**
 * @param {HTMLDialogElement} dialog
 */
function bind(dialog) {
  if (dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';

  const close = () => dialog.close();
  dialog.querySelector('.close')?.addEventListener('click', close);
  dialog.querySelector('.cancel')?.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('contact-dealer-open');
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  const form = dialog.querySelector('form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    form.classList.add('is-submitted');
    if (!form.checkValidity()) form.reportValidity();
  });
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {Object} copy
 */
function prepare(dialog, copy) {
  hydrateCopy(dialog, copy);
  fillCountries(dialog, copy);
  bind(dialog);
}

/**
 * @returns {Promise<HTMLDialogElement>}
 */
async function createDialog() {
  const [html, copy] = await Promise.all([
    fetch(assetUrl('html')).then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load contact dealer form: ${resp.status}`);
      return resp.text();
    }),
    loadCopy(import.meta.url),
    loadCSS(assetUrl('css')),
  ]);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dialog = doc.querySelector('dialog');
  if (!dialog) throw new Error('Contact dealer form is missing its dialog');
  document.body.append(dialog);
  prepare(dialog, copy);
  return dialog;
}

/**
 * @returns {Promise<HTMLDialogElement>}
 */
function ensureDialog() {
  const existing = document.querySelector('dialog.contact-dealer');
  if (existing) return Promise.resolve(existing);
  if (!pending) {
    pending = createDialog().catch((error) => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}

/**
 * Opens the contact dealer dialog and fills it from the product on this page.
 * @param {object} [listing]
 * @returns {Promise<void>}
 */
export async function openContactDealer(listing) {
  try {
    const dialog = await ensureDialog();
    fillProduct(dialog, listing);
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('contact-dealer-open');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('failed to open contact dealer form', error);
  }
}

/**
 * Decorates an authored contact-dealer widget.
 * @param {Element} widget
 */
export default async function decorate(widget) {
  const dialog = widget.querySelector('dialog');
  if (!dialog) return;
  const copy = await loadCopy(import.meta.url);
  document.body.append(dialog);
  prepare(dialog, copy);
  fillProduct(dialog);
}
