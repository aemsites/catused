import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

const TOOL_LABELS = {
  globe: 'Language',
  person: 'Account',
  grid: 'Apps',
};

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  sections.querySelectorAll('.nav-sections .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.nav-drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * Removes button classes that decorateButtons applied to nav fragment links.
 * @param {Element} root
 */
function stripButtonStyles(root) {
  root.querySelectorAll('a.button').forEach((link) => {
    link.classList.remove('button', 'primary', 'secondary', 'accent');
    const wrapper = link.closest('.button-wrapper');
    if (wrapper) wrapper.classList.remove('button-wrapper');
  });
}

/**
 * Collapses wrapping paragraphs around the brand link.
 * @param {Element} navBrand
 */
function decorateBrand(navBrand) {
  if (!navBrand) return;
  const link = navBrand.querySelector('a');
  if (!link) return;
  const container = navBrand.querySelector('.default-content-wrapper') || navBrand;
  if (navBrand.textContent.trim() === link.textContent.trim()) {
    container.replaceChildren(link);
  }
}

/**
 * Marks outbound links and appends an external-link icon.
 * @param {Element} link
 */
function decorateExternalLink(link) {
  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin === window.location.origin) return;
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
}

/**
 * Flattens section links, keeps dropdowns, and closes the mobile menu on navigate.
 * @param {Element} nav
 * @param {Element} navSections
 */
function decorateNavSections(nav, navSections) {
  if (!navSections) return;
  navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
    if (navSection.querySelector(':scope > ul')) {
      navSection.classList.add('nav-drop');
      navSection.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        if (isDesktop.matches) {
          const expanded = navSection.getAttribute('aria-expanded') === 'true';
          toggleAllNavSections(navSections);
          navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        }
      });
      return;
    }
    const p = navSection.querySelector(':scope > p');
    const link = p?.querySelector('a') || navSection.querySelector(':scope > a');
    if (p && link) p.replaceWith(link);
  });

  navSections.querySelectorAll('a[href]').forEach((link) => {
    decorateExternalLink(link);
    link.addEventListener('click', () => {
      if (!isDesktop.matches && nav.getAttribute('aria-expanded') === 'true') {
        toggleMenu(nav, navSections, false);
      }
    });
  });
}

/**
 * Labels tool icons when authors omit link text.
 * @param {Element} navTools
 */
function decorateTools(navTools) {
  if (!navTools) return;
  navTools.querySelectorAll('.icon').forEach((icon) => {
    const iconName = [...icon.classList].find((cls) => cls.startsWith('icon-'))?.slice(5);
    const label = TOOL_LABELS[iconName] || iconName;
    if (!label) return;
    const host = icon.closest('a') || icon.closest('p') || icon;
    if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', label);
    if (host.tagName === 'P' && !host.querySelector('a')) host.setAttribute('role', 'img');
  });
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  stripButtonStyles(nav);
  decorateBrand(nav.querySelector('.nav-brand'));

  const navSections = nav.querySelector('.nav-sections');
  decorateNavSections(nav, navSections);
  decorateTools(nav.querySelector('.nav-tools'));

  // hamburger for mobile
  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
  hamburger.addEventListener('click', () => toggleMenu(nav, navSections));
  nav.prepend(hamburger);
  nav.setAttribute('aria-expanded', 'false');
  // prevent mobile nav behavior on window resize
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
