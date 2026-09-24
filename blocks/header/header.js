import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import {
  LOCALES, localeLabel, readLocale, writeLocale,
} from '../../scripts/locale.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

const TOOL_LABELS = {
  globe: 'Region and currency',
  person: 'Account',
  grid: 'Apps',
};

const ACCOUNT_URL = 'https://myused.cat.com/';
const WAFFLE_PATH = '/nav/waffle';

let waffleRequest;

/**
 * Closes the apps menu opened from the waffle control.
 * @param {Element} nav
 */
function closeWaffle(nav) {
  const menu = nav.querySelector('.nav-waffle');
  const button = nav.querySelector('.nav-waffle-button');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

/**
 * Closes the region and currency menu.
 * @param {Element} nav
 */
function closeLocale(nav) {
  const menu = nav.querySelector('.nav-locale');
  const button = nav.querySelector('.nav-locale-button');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const locale = nav.querySelector('.nav-locale');
    if (locale && !locale.hidden) {
      closeLocale(nav);
      nav.querySelector('.nav-locale-button')?.focus();
      return;
    }
    const waffle = nav.querySelector('.nav-waffle');
    if (waffle && !waffle.hidden) {
      closeWaffle(nav);
      nav.querySelector('.nav-waffle-button')?.focus();
      return;
    }
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
    closeLocale(nav);
    closeWaffle(nav);
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
  if (expanded && !isDesktop.matches) {
    closeLocale(nav);
    closeWaffle(nav);
  }
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
 * Replaces an icon-only paragraph with the control that should own the icon.
 * @param {Element} icon
 * @param {Element} replacement
 * @returns {Element}
 */
function replaceIconHost(icon, replacement) {
  const paragraph = icon.closest('p');
  if (paragraph && paragraph.textContent.trim() === '') {
    paragraph.replaceWith(replacement);
  } else {
    icon.replaceWith(replacement);
  }
  replacement.append(icon);
  return replacement;
}

/**
 * Turns the account icon into a link to the sign-in site.
 * @param {Element} icon
 * @returns {HTMLAnchorElement}
 */
function linkAccount(icon) {
  const existing = icon.closest('a');
  if (existing) {
    existing.href = ACCOUNT_URL;
    return existing;
  }
  const link = document.createElement('a');
  link.href = ACCOUNT_URL;
  return replaceIconHost(icon, link);
}

/**
 * Loads the waffle fragment once and builds the apps menu.
 * @param {Element} nav
 * @returns {Promise<HTMLElement|null>}
 */
function ensureWaffleMenu(nav) {
  const navTools = nav.querySelector('.nav-tools');
  const existing = navTools?.querySelector('.nav-waffle');
  if (existing) return Promise.resolve(existing);
  if (!navTools) return Promise.resolve(null);
  if (!waffleRequest) {
    waffleRequest = loadFragment(WAFFLE_PATH)
      .then((fragment) => {
        const list = fragment?.querySelector('ul');
        if (!list) {
          waffleRequest = null;
          return null;
        }
        stripButtonStyles(list);
        list.querySelectorAll('a[href]').forEach((link) => decorateExternalLink(link));
        const menu = document.createElement('div');
        menu.className = 'nav-waffle';
        menu.id = 'nav-waffle';
        menu.hidden = true;
        menu.append(list);
        menu.addEventListener('click', (e) => {
          if (!e.target.closest('a')) return;
          closeWaffle(nav);
          if (!isDesktop.matches && nav.getAttribute('aria-expanded') === 'true') {
            toggleMenu(nav, nav.querySelector('.nav-sections'), false);
          }
        });
        navTools.append(menu);
        return menu;
      })
      .catch(() => {
        waffleRequest = null;
        return null;
      });
  }
  return waffleRequest;
}

/**
 * Turns the waffle icon into a button that fetches and toggles the apps menu.
 * @param {Element} nav
 * @param {Element} icon
 * @returns {HTMLButtonElement}
 */
function decorateWaffle(nav, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-waffle-button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'nav-waffle');
  replaceIconHost(icon, button);
  button.addEventListener('click', async () => {
    if (button.dataset.loading === 'true') return;
    const hadMenu = !!nav.querySelector('.nav-waffle');
    if (!hadMenu) {
      button.dataset.loading = 'true';
      button.setAttribute('aria-busy', 'true');
    }
    const menu = await ensureWaffleMenu(nav);
    if (!hadMenu) {
      delete button.dataset.loading;
      button.removeAttribute('aria-busy');
    }
    if (!menu) return;
    const open = menu.hidden;
    if (open) {
      closeLocale(nav);
      toggleAllNavSections(nav.querySelector('.nav-sections'), false);
    }
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  return button;
}

/**
 * Turns the globe icon into a region and currency picker.
 * @param {Element} nav
 * @param {Element} icon
 * @returns {HTMLButtonElement}
 */
function decorateLocale(nav, icon) {
  const current = readLocale();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-locale-button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'nav-locale');
  button.setAttribute('aria-label', `Region and currency, ${localeLabel(current)}`);
  replaceIconHost(icon, button);

  const menu = document.createElement('div');
  menu.className = 'nav-locale';
  menu.id = 'nav-locale';
  menu.hidden = true;
  const list = document.createElement('ul');
  LOCALES.forEach((locale) => {
    const item = document.createElement('li');
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.textContent = localeLabel(locale);
    const selected = locale.currency === current.currency && locale.region === current.region;
    if (selected) choice.setAttribute('aria-current', 'true');
    choice.addEventListener('click', () => {
      if (!selected) {
        writeLocale(locale);
        window.location.reload();
        return;
      }
      closeLocale(nav);
    });
    item.append(choice);
    list.append(item);
  });
  menu.append(list);
  button.after(menu);

  button.addEventListener('click', () => {
    const open = menu.hidden;
    if (open) closeWaffle(nav);
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  return button;
}

/**
 * Labels tool icons when authors omit link text.
 * @param {Element} nav
 * @param {Element} navTools
 */
function decorateTools(nav, navTools) {
  if (!navTools) return;
  navTools.querySelectorAll('.icon').forEach((icon) => {
    const iconName = [...icon.classList].find((cls) => cls.startsWith('icon-'))?.slice(5);
    const label = TOOL_LABELS[iconName] || iconName;
    if (!label) return;
    let host;
    if (iconName === 'person') host = linkAccount(icon);
    else if (iconName === 'grid') host = decorateWaffle(nav, icon);
    else if (iconName === 'globe') host = decorateLocale(nav, icon);
    else host = icon.closest('a') || icon.closest('p') || icon;
    if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', label);
    if (host.tagName === 'P' && !host.querySelector('a, button')) host.setAttribute('role', 'img');
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
  const navTools = nav.querySelector('.nav-tools');
  if (navSections) {
    const panel = document.createElement('div');
    panel.className = 'nav-panel';
    navSections.before(panel);
    panel.append(navSections);
    if (navTools) panel.append(navTools);
  }
  decorateNavSections(nav, navSections);
  decorateTools(nav, navTools);

  document.addEventListener('pointerdown', (e) => {
    const waffle = nav.querySelector('.nav-waffle');
    const waffleButton = nav.querySelector('.nav-waffle-button');
    const waffleHit = waffleButton?.contains(e.target) || waffle?.contains(e.target);
    if (waffle && !waffle.hidden && !waffleHit) closeWaffle(nav);
    const locale = nav.querySelector('.nav-locale');
    const localeButton = nav.querySelector('.nav-locale-button');
    const localeHit = localeButton?.contains(e.target) || locale?.contains(e.target);
    if (locale && !locale.hidden && !localeHit) closeLocale(nav);
  });

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
  isDesktop.addEventListener('change', () => {
    closeLocale(nav);
    closeWaffle(nav);
    toggleMenu(nav, navSections, isDesktop.matches);
  });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
