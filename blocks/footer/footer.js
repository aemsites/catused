import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Opens outbound footer links in a new tab.
 * @param {Element} container
 */
function decorateExternalLinks(container) {
  container.querySelectorAll('a[href]').forEach((link) => {
    try {
      if (new URL(link.href, window.location.href).hostname !== window.location.hostname) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    } catch {
      // ignore invalid urls
    }
  });
}

/**
 * Turns bare "Cookie Settings" items into a button for the consent manager.
 * @param {Element} section
 */
function decorateCookieSettings(section) {
  section.querySelectorAll('li').forEach((li) => {
    if (li.querySelector('a[href], button')) return;
    const text = li.textContent.trim();
    if (!text) return;
    const btn = document.createElement('button');
    btn.id = 'cookie';
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', async () => {
      const { default: openCookieSettings } = await import('../../scripts/consent-check.js');
      if (typeof openCookieSettings === 'function') await openCookieSettings();
    });
    li.replaceChildren(btn);
  });
}

/**
 * Labels the legal and language/copyright lists in the meta section.
 * @param {Element} section
 */
function decorateMeta(section) {
  const lists = [...section.querySelectorAll('ul')];
  if (lists[0]) lists[0].classList.add('footer-legal');
  if (lists.length > 1) {
    const end = lists[lists.length - 1];
    end.classList.add('footer-end');
    [...end.children].forEach((li) => {
      const text = li.textContent;
      if (/©|copyright/i.test(text)) {
        li.classList.add('footer-copyright');
        return;
      }
      li.classList.add('footer-lang');
    });
  }
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);
  if (!fragment) return;

  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  const classes = ['nav', 'meta'];
  classes.forEach((c, i) => {
    const section = footer.children[i];
    if (section) section.classList.add(`footer-${c}`);
  });

  const nav = footer.querySelector('.footer-nav');
  if (nav) decorateCookieSettings(nav);

  const meta = footer.querySelector('.footer-meta');
  if (meta) decorateMeta(meta);

  decorateExternalLinks(footer);

  block.append(footer);
}
