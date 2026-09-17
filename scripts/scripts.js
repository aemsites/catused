import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  buildBlock,
} from './aem.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * Origin that serves product-pipeline output.
 */
const PIPELINE_ORIGIN = 'https://main--catused--aemsites.aem.network';
const IS_PIPELINE_HOST = window.location.hostname.endsWith('.aem.network')
  || window.location.hostname.endsWith('catused.cat.com');

/**
 * True when the current document is a rendered product page.
 *
 * The pipeline writes `<meta name="sku">`; nothing else on the site does.
 * @returns {boolean}
 */
function isProductPage() {
  return !!document.querySelector('meta[name="sku"]');
}

/**
 * True when this host needs the product document fetched before it can render.
 * @returns {boolean}
 */
function needsPDPSimulation() {
  return !IS_PIPELINE_HOST
    && window.location.pathname.startsWith('/products/')
    && !isProductPage();
}

/**
 * Raises the priority of the PDP hero image.
 *
 * The product pipeline emits every image with `loading="lazy"`, including the
 * first one, so the browser's preload scanner deliberately skips it. Nothing
 * fetches the LCP candidate until something flips it back to eager.
 *
 * Called from the first line of `loadEager`, before any `await`, which is
 * effectively as early as module top-level -- `loadPage()` runs at the bottom of
 * this module, so only function declarations separate the two. A
 * `<link rel=preload>` is injected alongside the attribute flip because the link
 * starts fetching immediately, whereas the `<img>` cannot begin until style and
 * layout have resolved which `<source>` applies.
 *
 * `blocks/pdp/pdp.js` then *moves* this element into the gallery instead of
 * cloning it, so the in-flight request is never orphaned and the painted node
 * is the one already being fetched.
 */
function prioritizeHeroImage() {
  const picture = document.querySelector('main picture');
  const img = picture?.querySelector('img');
  if (!img) return;

  img.setAttribute('loading', 'eager');
  img.setAttribute('fetchpriority', 'high');
  picture.dataset.lcp = 'true';

  // Emit one preload per <source>, carrying its media query, so the browser
  // preloads exactly the variant it will render. Preloading a single source
  // without its media condition downloads the hero twice -- once for the
  // preload, once for the <picture> the viewport actually matches.
  const sources = [...picture.querySelectorAll('source[type="image/webp"]')];
  if (sources.length) {
    sources.forEach((source) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.setAttribute('fetchpriority', 'high');
      link.type = source.type;
      link.imageSrcset = source.srcset;
      if (source.media) link.media = source.media;
      else link.media = 'not all and (min-width: 600px)';
      document.head.append(link);
    });
    return;
  }

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.setAttribute('fetchpriority', 'high');
  link.href = img.getAttribute('src');
  document.head.append(link);
}

/**
 * Returns the two-letter language code for the current page.
 * @returns {string}
 */
export function getLocale() {
  const segment = window.location.pathname.split('/').filter(Boolean)[0];
  const lang = (segment && /^[a-z]{2}(-[a-z]{2})?$/i.test(segment)) ? segment : 'en';
  return lang.split('-')[0].toLowerCase();
}

/**
 * Fetches localized UI strings from a folder's companion JSON file.
 * @param {string} scriptUrl - The module's `import.meta.url`
 * @returns {Promise<Object>}
 */
export async function loadCopy(scriptUrl) {
  const jsonPath = new URL(scriptUrl).pathname.replace(/\.js$/, '.json');
  const url = `${(window.hlx && window.hlx.codeBasePath) || ''}${jsonPath}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return {};
    const data = await resp.json();
    return data[getLocale()] || data.en || {};
  } catch {
    return {};
  }
}

/**
 * Hydrates all `[data-copy]` elements within a container from a widget copy object.
 * @param {HTMLElement} container - Root element to search within
 * @param {Object} copy - Widget copy for the current language
 */
export function hydrateCopy(container, copy) {
  container.querySelectorAll('[data-copy]').forEach((el) => {
    const value = copy[el.dataset.copy];
    if (!value) return;
    const target = el.dataset.copyTarget;
    if (target) {
      target.split(',').forEach((attr) => el.setAttribute(attr.trim(), value));
    } else el.textContent = value;
  });
}

const FCORS_PROXY = 'https://fcors.org/?url=';
const FCORS_KEY = 'lakudfyapuodfyha';

/**
 * Whether the current page host can fetch AEM/Cat origins directly.
 * @returns {boolean}
 */
function isTrustedHost() {
  const { hostname } = window.location;
  return hostname === 'aem.network'
    || hostname.endsWith('.aem.network')
    || hostname === 'cat.com'
    || hostname.endsWith('.cat.com');
}

/**
 * Fetches JSON, proxying through fcors.org when the page is not on a trusted host.
 * @param {string} url Absolute URL to fetch
 * @returns {Promise<any>}
 */
export async function fetchJson(url) {
  const requestUrl = isTrustedHost()
    ? url
    : `${FCORS_PROXY}${encodeURIComponent(url)}&key=${FCORS_KEY}`;
  const resp = await fetch(requestUrl);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Turns `/widgets/...` links into widget blocks.
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Wraps the product-pipeline markup in a `pdp` block.
 *
 * The pipeline renders a flat document -- an `<h1>`, a price paragraph, then one
 * paragraph per image. Everything else the page needs lives in the JSON-LD,
 * which `blocks/pdp/pdp.js` reads.
 *
 * @param {Element} main The container element
 */
function buildPDPBlock(main) {
  // `loadFragment` also runs `decorateMain` over nav and footer fragments, so
  // identity-check the document's own <main> rather than trusting the sku meta
  // tag, which is global. Without this the block is rebuilt inside the header.
  if (main !== document.querySelector('main')) return;
  if (!isProductPage()) return;
  if (main.querySelector('.pdp')) return;

  const content = [...main.querySelectorAll(':scope > div')];
  if (!content.length) return;

  document.body.classList.add('pdp-template');

  // Collapse every pipeline div into one block: the first holds the heading,
  // price and images, any that follow hold the rendered `description`.
  const section = document.createElement('div');
  section.append(buildBlock('pdp', { elems: content.flatMap((div) => [...div.children]) }));
  content[0].replaceWith(section);
  content.slice(1).forEach((div) => div.remove());
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildPDPBlock(main);
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
    buildWidgetAutoBlocks(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Turns authored `data-background` URLs into optimized section background images.
 * @param {Element} main The main element
 */
function decorateSectionBackgrounds(main) {
  main.querySelectorAll('.section[data-background]').forEach((section) => {
    const { background } = section.dataset;
    if (!background) return;
    try {
      const { pathname } = new URL(background, window.location.href);
      if (pathname.endsWith('.mp4')) return;
      const ext = pathname.split('.').pop();
      const breakpoints = [
        { media: '(min-width: 900px)', width: '2880' },
        { width: '1600' },
      ];
      const picture = document.createElement('picture');
      breakpoints.forEach((br) => {
        const source = document.createElement('source');
        if (br.media) source.media = br.media;
        source.type = 'image/webp';
        source.srcset = `${pathname}?width=${br.width}&format=webply&optimize=medium`;
        picture.append(source);
      });
      breakpoints.forEach((br, i) => {
        if (i < breakpoints.length - 1) {
          const source = document.createElement('source');
          if (br.media) source.media = br.media;
          source.srcset = `${pathname}?width=${br.width}&format=${ext}&optimize=medium`;
          picture.append(source);
          return;
        }
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = '';
        img.src = `${pathname}?width=${br.width}&format=${ext}&optimize=medium`;
        picture.append(img);
      });
      picture.classList.add('section-background-image');
      picture.setAttribute('aria-hidden', 'true');
      section.prepend(picture);
    } catch {
      // ignore invalid urls
    }
  });
}

/**
 * Renders a product page on hosts that do not proxy the product pipeline.
 *
 * `aem.page`, `aem.live` and localhost serve the authored site, not the pipeline
 * output, so a `/products/*` URL returns a 404 shell with no product markup.
 * This fetches the rendered page from `aem.network` and swaps it in, giving the
 * same document the pipeline would have served.
 *
 * @returns {Promise<boolean>} true when a product document was substituted.
 */
async function simulatePDPPreview() {
  const { pathname } = window.location;
  try {
    const resp = await fetch(`${PIPELINE_ORIGIN}${pathname}`);
    if (!resp.ok) return false;

    const dom = new DOMParser().parseFromString(await resp.text(), 'text/html');
    if (!dom.querySelector('meta[name="sku"]')) return false;

    // Relative media paths resolve against the pipeline origin, not this host.
    dom.querySelectorAll('main [src^="./media_"]').forEach((el) => {
      el.setAttribute('src', el.getAttribute('src').replace('./', `${PIPELINE_ORIGIN}/products/`));
    });
    dom.querySelectorAll('main [srcset^="./media_"]').forEach((el) => {
      el.setAttribute('srcset', el.getAttribute('srcset').replace('./', `${PIPELINE_ORIGIN}/products/`));
    });

    // Keep the authored header/footer; replace only the product content and the
    // head metadata the block reads.
    document.querySelector('main').replaceWith(dom.querySelector('main'));
    dom.head.querySelectorAll('meta[name="sku"], meta[name="type"], script[type="application/ld+json"]')
      .forEach((el) => document.head.append(el));
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PDP preview simulation failed', error);
    return false;
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionBackgrounds(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';

  // Product pages only exist on the pipeline origin; everywhere else, fetch the
  // rendered document before decorating so the block has markup to work with.
  if (needsPDPSimulation()) await simulatePDPPreview();

  // Scoped to product pages, and ahead of everything else on them.
  if (isProductPage()) prioritizeHeroImage();

  decorateTemplateAndTheme();

  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('body > header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('body > footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  import('./consent-check.js');
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
