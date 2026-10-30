let carouselId = 0;

export default function decorate(block) {
  const rows = [...block.children];
  if (!rows.length) return;

  carouselId += 1;
  const id = `carousel-new-${carouselId}`;
  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');
  if (!block.hasAttribute('aria-label') && !block.hasAttribute('aria-labelledby')) {
    block.setAttribute('aria-label', 'Image carousel');
  }

  const viewport = document.createElement('div');
  viewport.className = 'carousel-new-viewport';
  const track = document.createElement('div');
  track.className = 'carousel-new-slides';
  track.id = `${id}-slides`;
  const slides = rows.map((row, index) => {
    row.classList.add('carousel-new-slide');
    row.id = `${id}-slide-${index + 1}`;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-roledescription', 'slide');
    row.setAttribute('aria-label', `${index + 1} of ${rows.length}`);
    [...row.children].forEach((cell) => {
      cell.classList.add(cell.querySelector('picture, img')
        ? 'carousel-new-image' : 'carousel-new-content');
    });
    track.append(row);
    return row;
  });
  viewport.append(track);
  block.append(viewport);

  let activeIndex = 0;
  const indicators = [];
  const status = document.createElement('p');
  status.className = 'carousel-new-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');

  function updateActiveSlide(index) {
    activeIndex = index;
    block.dataset.activeSlide = String(index);
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      if (!active && slide.contains(document.activeElement)) track.focus({ preventScroll: true });
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    indicators.forEach((button, slideIndex) => {
      if (slideIndex === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    status.textContent = `Slide ${index + 1} of ${slides.length}`;
  }

  function showSlide(index) {
    const target = (index + slides.length) % slides.length;
    const offset = slides[target].getBoundingClientRect().left
      - track.getBoundingClientRect().left;
    updateActiveSlide(target);
    track.scrollTo({
      left: track.scrollLeft + offset,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  function createButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-controls', track.id);
    button.addEventListener('click', onClick);
    return button;
  }

  if (slides.length > 1) {
    track.tabIndex = 0;
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Slides. Use left and right arrow keys to navigate.');
    const navigation = document.createElement('div');
    navigation.className = 'carousel-new-navigation';
    navigation.append(
      createButton('Previous slide', 'carousel-new-previous', () => showSlide(activeIndex - 1)),
      createButton('Next slide', 'carousel-new-next', () => showSlide(activeIndex + 1)),
    );
    viewport.append(navigation);

    const dots = document.createElement('div');
    dots.className = 'carousel-new-indicators';
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', 'Choose a slide');
    slides.forEach((slide, index) => {
      const button = createButton(`Show slide ${index + 1} of ${slides.length}`, 'carousel-new-indicator', () => showSlide(index));
      button.setAttribute('aria-controls', slide.id);
      indicators.push(button);
      dots.append(button);
    });
    block.append(dots, status);

    block.addEventListener('keydown', (event) => {
      if (event.target !== track && !event.target.closest('.carousel-new-navigation, .carousel-new-indicators')) return;
      const targets = {
        ArrowLeft: activeIndex - 1,
        ArrowRight: activeIndex + 1,
        Home: 0,
        End: slides.length - 1,
      };
      if (!(event.key in targets)) return;
      event.preventDefault();
      showSlide(targets[event.key]);
    });

    let scrollTimer;
    track.addEventListener('scroll', () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const { left } = track.getBoundingClientRect();
        const distances = slides.map((slide) => (
          Math.abs(slide.getBoundingClientRect().left - left)
        ));
        updateActiveSlide(distances.indexOf(Math.min(...distances)));
      }, 150);
    }, { passive: true });
  }

  updateActiveSlide(0);
}
