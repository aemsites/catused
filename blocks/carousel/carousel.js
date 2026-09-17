import { createOptimizedPicture } from '../../scripts/aem.js';
import { fetchProductDocument } from '../../scripts/scripts.js';

const LABELS = {
  carousel: 'Carousel',
  carouselSlideControls: 'Carousel Slide Controls',
  previousSlide: 'Previous Slide',
  nextSlide: 'Next Slide',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  showSlide: 'Show Slide',
  showPage: 'Show page',
  of: 'of',
};

/**
 * @param {string} href
 * @returns {boolean}
 */
function isProductHref(href) {
  try {
    const { pathname } = new URL(href, window.location.href);
    return /^\/products\/[^/]+/.test(pathname) && !pathname.endsWith('.json');
  } catch {
    return false;
  }
}

/**
 * @param {Element} block
 * @returns {string[]}
 */
function productHrefsFromBlock(block) {
  if (block.querySelector('picture, img, h1, h2, h3, h4, h5, h6')) return [];
  const hrefs = [];
  const seen = new Set();
  block.querySelectorAll('a[href]').forEach((anchor) => {
    if (!isProductHref(anchor.href)) return;
    if (seen.has(anchor.href)) return;
    seen.add(anchor.href);
    hrefs.push(anchor.href);
  });
  return hrefs;
}

/**
 * @param {Document} dom
 * @param {string} fallbackHref
 * @returns {Object|null}
 */
function productFromDocument(dom, fallbackHref) {
  let jsonld = {};
  try {
    const script = dom.querySelector('script[type="application/ld+json"]');
    if (script) jsonld = JSON.parse(script.textContent);
  } catch {
    jsonld = {};
  }
  const custom = jsonld.custom || {};
  const offers = Array.isArray(jsonld.offers) ? jsonld.offers : [jsonld.offers];
  const offer = offers[0] || {};
  const images = Array.isArray(jsonld.image) ? jsonld.image : [jsonld.image];
  const image = images.find(Boolean)
    || dom.querySelector('meta[property="og:image"]')?.content
    || '';
  const name = jsonld.name || dom.querySelector('main h1')?.textContent?.trim() || '';
  if (!name && !image) return null;

  const hours = custom.serviceMeter?.value;
  const place = [custom.location?.state, custom.location?.country].filter(Boolean).join(', ');
  const price = Number(offer.price);
  const bits = [];
  if (!Number.isNaN(price) && price > 0) {
    bits.push(offer.priceCurrency === 'USD' || !offer.priceCurrency
      ? `$${Math.round(price).toLocaleString('en-US')}`
      : `${Math.round(price).toLocaleString('en-US')} ${offer.priceCurrency}`);
  }
  if (hours != null && hours !== '') bits.push(`${Math.round(Number(hours)).toLocaleString('en-US')} hrs`);
  if (place) bits.push(place);

  let href = jsonld.url || fallbackHref;
  try {
    const url = new URL(href, window.location.href);
    if (url.pathname.startsWith('/products/')) href = url.pathname;
  } catch {
    // keep original
  }

  return {
    sku: String(jsonld.sku || custom.catusedId || ''),
    name,
    image,
    year: custom.year,
    summary: bits.join(' · ') || jsonld.description || '',
    href,
  };
}

/**
 * Builds one authored listing row from a product payload.
 * @param {Object} product
 * @returns {HTMLElement}
 */
function listingRowFromProduct(product) {
  const row = document.createElement('div');
  const cell = document.createElement('div');

  if (product.image) {
    const imageWrap = document.createElement('p');
    imageWrap.append(createOptimizedPicture(product.image, product.name, false, [{ width: '750' }]));
    cell.append(imageWrap);
  }

  if (product.year) {
    const badge = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = String(product.year);
    badge.append(strong);
    cell.append(badge);
  }

  const heading = document.createElement('h3');
  if (product.sku) heading.id = `listing-${product.sku}`;
  heading.textContent = product.name;
  cell.append(heading);

  if (product.summary) {
    const meta = document.createElement('p');
    meta.textContent = product.summary;
    cell.append(meta);
  }

  const wrap = document.createElement('p');
  wrap.className = 'button-wrapper';
  const link = document.createElement('a');
  link.className = 'button primary';
  link.href = product.href;
  link.textContent = 'View Listing';
  wrap.append(link);
  cell.append(wrap);

  row.append(cell);
  return row;
}

/**
 * When the carousel is authored as product URLs, fetch those pages and replace
 * the block with the same markup a fully authored listing carousel would have.
 * @param {Element} block
 * @returns {Promise<boolean>}
 */
async function hydrateFromProductUrls(block) {
  const hrefs = productHrefsFromBlock(block);
  if (!hrefs.length) return false;

  const docs = await Promise.all(hrefs.map((href) => (
    fetchProductDocument(href).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('failed to load carousel product', href, error);
      return null;
    })
  )));

  const rows = [];
  docs.forEach((dom, i) => {
    if (!dom) return;
    const product = productFromDocument(dom, hrefs[i]);
    if (product) rows.push(listingRowFromProduct(product));
  });
  if (!rows.length) return false;

  block.replaceChildren();
  block.classList.add('listing');
  rows.forEach((row) => block.append(row));
  return true;
}

function listingPerView() {
  if (window.innerWidth >= 1024) return 4;
  if (window.innerWidth >= 900) return 3;
  return 1;
}

function maxListingIndex(block) {
  const count = block.querySelectorAll('.carousel-slide').length;
  return Math.max(0, count - listingPerView());
}

function listingPageCount(block) {
  const count = block.querySelectorAll('.carousel-slide').length;
  return Math.max(1, Math.ceil(count / listingPerView()));
}

function listingPageStart(page, block) {
  const pages = listingPageCount(block);
  const i = Math.min(Math.max(0, page), pages - 1);
  return Math.min(i * listingPerView(), maxListingIndex(block));
}

function listingPageIndex(slideIndex, block) {
  const pages = listingPageCount(block);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pages; i += 1) {
    const dist = Math.abs(listingPageStart(i, block) - slideIndex);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function isSlideInView(slide, scroller) {
  const parent = scroller.getBoundingClientRect();
  const rect = slide.getBoundingClientRect();
  return rect.left < parent.right - 8 && rect.right > parent.left + 8;
}

function updateListingNav(block) {
  const prev = block.querySelector('.slide-prev');
  const next = block.querySelector('.slide-next');
  if (!prev || !next) return;
  const index = parseInt(block.dataset.activeSlide, 10) || 0;
  const page = listingPageIndex(index, block);
  prev.disabled = page <= 0;
  next.disabled = page >= listingPageCount(block) - 1;
}

function updateActiveSlide(slide) {
  const block = slide.closest('.carousel');
  const slideIndex = parseInt(slide.dataset.slideIndex, 10);
  block.dataset.activeSlide = slideIndex;

  const slides = block.querySelectorAll('.carousel-slide');
  const scroller = block.querySelector('.carousel-slides');
  const isListing = block.classList.contains('listing');

  slides.forEach((aSlide, idx) => {
    const visible = isListing ? isSlideInView(aSlide, scroller) : idx === slideIndex;
    aSlide.setAttribute('aria-hidden', !visible);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (!visible) link.setAttribute('tabindex', '-1');
      else link.removeAttribute('tabindex');
    });
  });

  const indicators = block.querySelectorAll('.carousel-slide-indicator');
  const activeIndicator = isListing ? listingPageIndex(slideIndex, block) : slideIndex;
  indicators.forEach((indicator, idx) => {
    const button = indicator.querySelector('button');
    if (!button) return;
    if (idx !== activeIndicator) button.removeAttribute('disabled');
    else button.setAttribute('disabled', 'true');
  });

  if (isListing) updateListingNav(block);
}

function showSlide(block, slideIndex = 0) {
  const slides = block.querySelectorAll('.carousel-slide');
  let realSlideIndex = slideIndex;
  if (block.classList.contains('listing')) {
    realSlideIndex = Math.min(Math.max(0, slideIndex), maxListingIndex(block));
  } else {
    if (slideIndex < 0) realSlideIndex = slides.length - 1;
    if (slideIndex >= slides.length) realSlideIndex = 0;
  }
  const activeSlide = slides[realSlideIndex];
  if (!activeSlide) return;

  activeSlide.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
  block.querySelector('.carousel-slides').scrollTo({
    top: 0,
    left: activeSlide.offsetLeft,
    behavior: 'smooth',
  });
}

function paintListingIndicators(block) {
  const nav = block.querySelector('.carousel-slide-indicators');
  if (!nav) return;
  const pages = listingPageCount(block);
  const current = parseInt(block.dataset.activeSlide, 10) || 0;
  const activePage = listingPageIndex(current, block);
  nav.replaceChildren();
  for (let i = 0; i < pages; i += 1) {
    const target = listingPageStart(i, block);
    const item = document.createElement('li');
    item.className = 'carousel-slide-indicator';
    item.dataset.targetSlide = String(target);
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = `${LABELS.showPage} ${i + 1} ${LABELS.of} ${pages}`;
    button.append(label);
    if (i === activePage) button.disabled = true;
    button.addEventListener('click', () => showSlide(block, target));
    item.append(button);
    nav.append(item);
  }
}

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-slide-indicators');
  if (!slideIndicators) return;

  const isListing = block.classList.contains('listing');
  if (!isListing) {
    slideIndicators.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', (e) => {
        const slideIndicator = e.currentTarget.parentElement;
        showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
      });
    });
  }

  block.querySelector('.slide-prev').addEventListener('click', () => {
    const current = parseInt(block.dataset.activeSlide, 10) || 0;
    if (isListing) {
      showSlide(block, listingPageStart(listingPageIndex(current, block) - 1, block));
      return;
    }
    showSlide(block, current - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    const current = parseInt(block.dataset.activeSlide, 10) || 0;
    if (isListing) {
      showSlide(block, listingPageStart(listingPageIndex(current, block) + 1, block));
      return;
    }
    showSlide(block, current + 1);
  });

  const scroller = block.querySelector('.carousel-slides');
  const slideObserver = new IntersectionObserver((entries) => {
    if (isListing) {
      const parentBox = scroller.getBoundingClientRect();
      let closest = scroller.querySelector('.carousel-slide');
      let min = Infinity;
      scroller.querySelectorAll('.carousel-slide').forEach((s) => {
        const dist = Math.abs(s.getBoundingClientRect().left - parentBox.left);
        if (dist < min) {
          min = dist;
          closest = s;
        }
      });
      if (closest) updateActiveSlide(closest);
      return;
    }
    entries.forEach((entry) => {
      if (entry.isIntersecting) updateActiveSlide(entry.target);
    });
  }, { root: isListing ? scroller : null, threshold: 0.5 });
  block.querySelectorAll('.carousel-slide').forEach((slide) => {
    slideObserver.observe(slide);
  });

  if (isListing) {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        paintListingIndicators(block);
        showSlide(block, parseInt(block.dataset.activeSlide, 10) || 0);
      }, 120);
    });
  }
}

/**
 * Turns inner listing links into a single cover link so the whole slide is clickable.
 * @param {Element} slide
 */
function wrapSlideLink(slide) {
  if (slide.querySelector(':scope > .listing-link')) return;
  const links = [...slide.querySelectorAll('a[href]')];
  if (!links.length) return;
  const source = slide.querySelector('.button-wrapper a[href], a.button[href]') || links[0];
  const { href } = source;
  links.forEach((link) => {
    const replacement = document.createElement('span');
    replacement.className = link.className;
    while (link.firstChild) replacement.append(link.firstChild);
    link.replaceWith(replacement);
  });
  const cover = document.createElement('a');
  cover.className = 'listing-link';
  cover.href = href;
  while (slide.firstChild) cover.append(slide.firstChild);
  slide.append(cover);
}

/**
 * Marks badge and body content when a listing slide is a single mixed cell.
 * @param {Element} block
 */
function decorateListing(block) {
  if (!block.classList.contains('listing')) return;
  block.querySelectorAll('.carousel-slide').forEach((slide) => {
    const root = slide.querySelector('.carousel-slide-image') || slide;
    [...root.children].forEach((el) => {
      if (el.matches('p') && el.querySelector('strong') && !el.querySelector('picture, img')) {
        el.classList.add('listing-badge');
      }
    });
    const body = document.createElement('div');
    body.className = 'listing-body';
    [...root.children].forEach((el) => {
      if (el.classList.contains('listing-badge')) return;
      if (el.querySelector('picture, img') || el.tagName === 'PICTURE') return;
      body.append(el);
    });
    if (body.children.length) root.append(body);
    wrapSlideLink(slide);
  });
}

function createSlide(row, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-slide');

  row.querySelectorAll(':scope > div').forEach((column, colIdx) => {
    column.classList.add(`carousel-slide-${colIdx === 0 ? 'image' : 'content'}`);
    slide.append(column);
  });

  const labeledBy = slide.querySelector('h1, h2, h3, h4, h5, h6');
  if (labeledBy) {
    slide.setAttribute('aria-labelledby', labeledBy.getAttribute('id'));
  }

  return slide;
}

let carouselId = 0;
export default async function decorate(block) {
  await hydrateFromProductUrls(block);

  carouselId += 1;
  block.setAttribute('id', `carousel-${carouselId}`);
  const rows = block.querySelectorAll(':scope > div');
  const isSingleSlide = rows.length < 2;

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', LABELS.carousel);

  const container = document.createElement('div');
  container.classList.add('carousel-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-slides');
  block.prepend(slidesWrapper);

  let slideIndicators;
  if (!isSingleSlide) {
    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', LABELS.carouselSlideControls);
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    block.append(slideIndicatorsNav);

    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-navigation-buttons');
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'slide-prev';
    prev.setAttribute('aria-label', block.classList.contains('listing')
      ? LABELS.previousPage : LABELS.previousSlide);
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'slide-next';
    next.setAttribute('aria-label', block.classList.contains('listing')
      ? LABELS.nextPage : LABELS.nextSlide);
    slideNavButtons.append(prev, next);

    container.append(slideNavButtons);
  }

  rows.forEach((row, idx) => {
    const slide = createSlide(row, idx, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators && !block.classList.contains('listing')) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-slide-indicator');
      indicator.dataset.targetSlide = idx;
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('span');
      label.textContent = `${LABELS.showSlide} ${idx + 1} ${LABELS.of} ${rows.length}`;
      button.append(label);
      indicator.append(button);
      slideIndicators.append(indicator);
    }
    row.remove();
  });

  container.append(slidesWrapper);
  block.prepend(container);

  decorateListing(block);

  if (!isSingleSlide) {
    if (block.classList.contains('listing')) paintListingIndicators(block);
    bindEvents(block);
  }
}
