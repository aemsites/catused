import {
  add, icon, readProduct, readTitle,
} from './pdp-utils.js';
import { buildGallery, buildPurchaseCard } from './pdp-product.js';
import {
  buildStats, buildSpecifications, buildDetails, buildCondition, buildSimilar, buildStickyBar,
} from './pdp-sections.js';

/**
 * Keeps the gallery dots and thumbnails in step with the scroll-snap track.
 *
 * The gesture itself is entirely native: the track is a horizontally scrollable
 * element with `scroll-snap-type`, so dragging, momentum, rubber-banding at the
 * ends and snapping all come from the browser. This only reflects the resulting
 * scroll position back into the controls, and drives the track when a dot,
 * thumbnail or arrow is used.
 *
 * @param {HTMLElement} block
 */
function decorateGalleryInteractions(block) {
  const track = block.querySelector('.pdp-gallery-track');
  const slides = [...block.querySelectorAll('.pdp-gallery-slide')];
  const thumbs = [...block.querySelectorAll('.pdp-thumb')];
  const dots = [...block.querySelectorAll('.pdp-dot')];
  if (!track || slides.length < 2) return;

  const mark = (index) => {
    thumbs.forEach((thumb, i) => thumb.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };

  const goTo = (index) => {
    const target = Math.max(0, Math.min(index, slides.length - 1));
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  // Reading scroll position inside rAF keeps layout reads off the scroll event.
  let queued = false;
  track.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mark(Math.round(track.scrollLeft / track.clientWidth));
    });
  }, { passive: true });

  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => goTo(i)));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  block.querySelectorAll('.pdp-gallery-arrow').forEach((arrow, i) => {
    arrow.addEventListener('click', () => {
      const current = Math.round(track.scrollLeft / track.clientWidth);
      goTo(current + (i === 0 ? -1 : 1));
    });
  });
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
 * Controls the sticky purchase bar across three states.
 *
 * 1. Hidden while the inline "Contact Dealer" button is still reachable -- the
 *    bar would only duplicate a call to action already on screen.
 * 2. Shown once that button has scrolled *above* the viewport, and it stays
 *    shown regardless of scroll direction. Direction-aware hiding is the
 *    convention for navigation, but on a product page scrolling down is the
 *    dominant direction, so it would withdraw the call to action from exactly
 *    the engaged readers most likely to act on it.
 * 3. Tucked away again once the footer appears, so the page end is reachable.
 *
 * Both triggers are IntersectionObservers rather than scroll listeners, so the
 * work stays off the main thread and there is nothing to throttle.
 *
 * @param {HTMLElement} block
 */
function decorateStickyBar(block) {
  const bar = block.querySelector('.pdp-sticky');
  if (!bar || !window.IntersectionObserver) return;

  const inlineCta = block.querySelector('.pdp-dealer-cta');
  if (inlineCta) {
    // Start hidden: the observer's first callback is asynchronous, and without
    // this the bar paints once before being told to hide.
    bar.classList.add('is-hidden');

    // Extending the root far below the viewport turns this into a position test
    // rather than a visibility test: the button intersects whenever it sits at
    // or below the viewport top, and stops the moment it scrolls above it.
    // Observing plain visibility is unreliable here, because a fast fling or an
    // anchor jump can carry the button from below the fold to above it without
    // it ever being sampled on screen, so `isIntersecting` never changes and no
    // callback fires.
    new IntersectionObserver(([entry]) => {
      bar.classList.toggle('is-hidden', entry.isIntersecting);
    }, { rootMargin: '0px 0px 100000px 0px' }).observe(inlineCta);
  }

  const footer = document.querySelector('body > footer');
  if (footer) {
    new IntersectionObserver(([entry]) => {
      bar.classList.toggle('is-tucked', entry.isIntersecting);
    }, { threshold: 0 }).observe(footer);
  }
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
