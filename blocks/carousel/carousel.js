const LABELS = {
  carousel: 'Carousel',
  carouselSlideControls: 'Carousel Slide Controls',
  previousSlide: 'Previous Slide',
  nextSlide: 'Next Slide',
  showSlide: 'Show Slide',
  of: 'of',
};

function listingPerView() {
  if (window.innerWidth >= 1024) return 4;
  if (window.innerWidth >= 900) return 3;
  return 1;
}

function maxListingIndex(block) {
  const count = block.querySelectorAll('.carousel-slide').length;
  return Math.max(0, count - listingPerView());
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
  const max = maxListingIndex(block);
  prev.disabled = index <= 0;
  next.disabled = index >= max;
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
  indicators.forEach((indicator, idx) => {
    const button = indicator.querySelector('button');
    if (!button) return;
    if (idx !== slideIndex) button.removeAttribute('disabled');
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

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-slide-indicators');
  if (!slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const scroller = block.querySelector('.carousel-slides');
  const isListing = block.classList.contains('listing');
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
        showSlide(block, parseInt(block.dataset.activeSlide, 10) || 0);
      }, 120);
    });
  }
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
    slideNavButtons.innerHTML = `
      <button type="button" class= "slide-prev" aria-label="${LABELS.previousSlide}"></button>
      <button type="button" class="slide-next" aria-label="${LABELS.nextSlide}"></button>
    `;

    container.append(slideNavButtons);
  }

  rows.forEach((row, idx) => {
    const slide = createSlide(row, idx, carouselId);
    slidesWrapper.append(slide);

    if (slideIndicators) {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-slide-indicator');
      indicator.dataset.targetSlide = idx;
      indicator.innerHTML = `<button type="button"><span>${LABELS.showSlide} ${idx + 1} ${LABELS.of} ${rows.length}</span></button>`;
      slideIndicators.append(indicator);
    }
    row.remove();
  });

  container.append(slidesWrapper);
  block.prepend(container);

  decorateListing(block);

  if (!isSingleSlide) {
    bindEvents(block);
  }
}
