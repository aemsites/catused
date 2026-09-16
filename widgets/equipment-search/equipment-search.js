import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';

/**
 * Decorates the equipment search form widget.
 * @param {Element} widget The widget element
 */
export default async function decorate(widget) {
  const copy = await loadCopy(import.meta.url);
  hydrateCopy(widget, copy);

  const form = widget.querySelector('form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}
