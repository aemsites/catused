import {
  add, icon, readProduct, readTitle,
} from './pdp-utils.js';
import { buildGallery, buildPurchaseCard } from './pdp-product.js';
import {
  buildStats, buildSpecifications, buildDetails, buildCondition, buildSimilar, buildStickyBar,
} from './pdp-sections.js';

/**
 * Horizontal swipe/drag navigation.
 *
 * Uses pointer events so touch, pen and mouse all work from one code path. The
 * gesture is only treated as a swipe when horizontal travel clearly dominates,
 * so vertical page scrolling is never hijacked.
 *
 * @param {Element|null} surface
 * @param {(delta: number) => void} step
 */
function addSwipe(surface, step) {
  if (!surface) return;

  const THRESHOLD = 40;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  surface.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    tracking = true;
  });

  const finish = (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  };

  surface.addEventListener('pointerup', finish);
  surface.addEventListener('pointercancel', () => { tracking = false; });
}

/**
 * Wires the gallery thumbnails, dots and arrows to swap the hero image.
 *
 * Swapping updates the existing hero `<img>`/`<source>` attributes rather than
 * replacing the element, so the LCP node stays stable for the whole session.
 *
 * @param {HTMLElement} block
 */
function decorateGalleryInteractions(block) {
  const hero = block.querySelector('.pdp-gallery-hero picture');
  const thumbs = [...block.querySelectorAll('.pdp-thumb')];
  const dots = [...block.querySelectorAll('.pdp-dot')];
  if (!hero || thumbs.length < 2) return;

  const show = (index) => {
    const source = thumbs[index]?.querySelector('picture');
    if (!source) return;

    const nextSources = source.querySelectorAll('source');
    hero.querySelectorAll('source').forEach((element, i) => {
      if (nextSources[i]) element.setAttribute('srcset', nextSources[i].getAttribute('srcset'));
    });

    const heroImg = hero.querySelector('img');
    const nextImg = source.querySelector('img');
    if (heroImg && nextImg) {
      heroImg.setAttribute('src', nextImg.getAttribute('src'));
      heroImg.setAttribute('alt', nextImg.getAttribute('alt') || '');
    }

    thumbs.forEach((thumb, i) => thumb.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };

  const step = (delta) => {
    const current = thumbs.findIndex((thumb) => thumb.classList.contains('is-active'));
    show((current + delta + thumbs.length) % thumbs.length);
  };

  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => show(i)));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i)));

  // Arrows are desktop-only in the design; mobile navigates by swipe and dots.
  block.querySelectorAll('.pdp-gallery-arrow').forEach((arrow, i) => {
    arrow.addEventListener('click', () => step(i === 0 ? -1 : 1));
  });

  addSwipe(hero.closest('.pdp-gallery-hero'), step);
}

/**
 * Reflects checkbox state on protection and attachment options.
 * @param {HTMLElement} block
 */
function decorateOptions(block) {
  block.querySelectorAll('.pdp-option').forEach((option) => {
    const input = option.querySelector('.pdp-option-input');
    if (!input) return;
    input.addEventListener('change', () => {
      option.classList.toggle('is-selected', input.checked);
    });
  });
}

/**
 * Toggles the save (heart) buttons.
 * @param {HTMLElement} block
 */
function decorateSaveButtons(block) {
  block.querySelectorAll('.pdp-save').forEach((button) => {
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
    });
  });
}

/**
 * Reveals the remaining inspection categories inside the report dialog.
 * @param {HTMLElement} block
 */
function decorateReportViewAll(block) {
  const button = block.querySelector('.pdp-dialog-all');
  if (!button) return;
  button.addEventListener('click', () => {
    block.querySelectorAll('.pdp-dialog-rows .pdp-report-row.is-hidden')
      .forEach((row) => row.classList.remove('is-hidden'));
    button.remove();
  });
}

/**
 * Slides the sticky purchase bar out of the way once the footer is reached.
 *
 * Uses an IntersectionObserver on the footer rather than a scroll listener, so
 * the work happens off the main thread and there is nothing to throttle. The bar
 * returns as soon as the footer leaves the viewport again.
 *
 * @param {HTMLElement} block
 */
function decorateStickyBar(block) {
  const bar = block.querySelector('.pdp-sticky');
  const footer = document.querySelector('body > footer');
  if (!bar || !footer || !window.IntersectionObserver) return;

  const observer = new IntersectionObserver(([entry]) => {
    bar.classList.toggle('is-tucked', entry.isIntersecting);
  }, { threshold: 0 });

  observer.observe(footer);
}

/**
 * Wires a `<dialog>` to an opener button.
 *
 * `showModal` supplies focus trapping and Escape-to-close, but not scroll
 * locking -- without it the page behind keeps its own scrollbar, so the drawer
 * renders beside a second one and `100vw` sizing lands off-centre.
 *
 * @param {HTMLElement} block
 * @param {string} dialogSelector
 * @param {string} openerSelector
 * @param {string} closeSelector
 */
function wireDialog(block, dialogSelector, openerSelector, closeSelector) {
  const dialog = block.querySelector(dialogSelector);
  const opener = block.querySelector(openerSelector);
  if (!dialog || !opener) return;

  const lock = (on) => document.documentElement.classList.toggle('pdp-dialog-open', on);

  opener.addEventListener('click', () => {
    dialog.showModal();
    lock(true);
  });
  dialog.addEventListener('close', () => lock(false));
  dialog.querySelector(closeSelector)?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

/**
 * Expands the truncated detail lists.
 * @param {HTMLElement} block
 */
function decorateDetailToggles(block) {
  block.querySelectorAll('.pdp-detail-more').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.closest('.pdp-detail-panel');
      panel?.querySelectorAll('.pdp-detail-item.is-hidden')
        .forEach((item) => item.classList.remove('is-hidden'));
      button.remove();
    });
  });
}

/**
 * Builds the page header: back link, family eyebrow, title and save button.
 *
 * Deliberately a `<div>`, not a `<header>`: `styles.css` sets a bare
 * `header { height: var(--nav-height) }` for the site nav, which would clamp
 * this to 64px and slice the title in half.
 *
 * @param {string} eyebrow
 * @param {string} title
 * @returns {HTMLElement}
 */
function buildHeader(eyebrow, title) {
  const header = document.createElement('div');
  header.className = 'pdp-header';

  const back = add('a', 'pdp-back', header, 'Search');
  back.href = '/';
  back.prepend(icon('chevron', 'pdp-rot-180'));

  const row = add('div', 'pdp-header-row', header);
  const titles = add('div', null, row);
  if (eyebrow) add('p', 'pdp-eyebrow', titles, eyebrow);
  add('h1', 'pdp-title', titles, title);

  const save = add('button', 'pdp-save pdp-save-header', row);
  save.type = 'button';
  save.setAttribute('aria-label', `Save ${title}`);
  save.setAttribute('aria-pressed', 'false');
  save.append(icon('heart'));

  return header;
}

/**
 * @param {HTMLElement} block
 */
export default function decorate(block) {
  const { custom, offer } = readProduct();
  const { eyebrow, title } = readTitle(custom);

  // The pipeline emits one <p><picture> per image, then the rendered
  // `description` as a list. Capture both before the block is rebuilt; the first
  // picture is the in-flight LCP candidate.
  const pictures = [...block.querySelectorAll('picture')];
  const headingText = block.querySelector('h1')?.textContent?.trim() ?? '';
  const accessories = [...block.querySelectorAll('ul li')]
    .map((item) => item.textContent.trim())
    .filter(Boolean);

  const name = title || headingText;
  block.textContent = '';

  block.append(buildHeader(eyebrow, name));

  const hero = add('div', 'pdp-main', block);
  hero.append(buildGallery(pictures, name), buildPurchaseCard(custom, offer, name));

  block.append(buildStats());

  const info = add('div', 'pdp-info', block);
  info.append(buildSpecifications(), buildDetails(accessories));

  block.append(
    buildCondition(custom, name, pictures),
    buildSimilar(name, pictures),
    buildStickyBar(offer),
  );

  decorateGalleryInteractions(block);
  decorateOptions(block);
  decorateSaveButtons(block);
  decorateDetailToggles(block);
  wireDialog(block, '.pdp-drawer', '.pdp-gallery-viewall', '.pdp-drawer-close');
  wireDialog(block, '.pdp-dialog', '.pdp-condition-link', '.pdp-dialog-close');
  decorateStickyBar(block);
  decorateReportViewAll(block);
}
