/**
 * Decorates a hero: LCP image and a copy wrapper around the heading.
 * @param {Element} block
 */
export default function decorate(block) {
  const img = block.querySelector('img');
  if (img) {
    img.loading = 'eager';
    img.fetchPriority = 'high';
  }

  const heading = block.querySelector('h1, h2');
  if (!heading || heading.closest('.hero-copy')) return;
  const copy = document.createElement('div');
  copy.className = 'hero-copy';
  heading.replaceWith(copy);
  copy.append(heading);
}
