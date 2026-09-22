import {
  add, icon, money, NUM,
} from './pdp-utils.js';

/**
 * Appends the Cat Certified Used lockup.
 *
 * Renders only for Cat Certified Used (`CCU`) inventory. The original visual
 * mock showed it on every machine, but the live Product Bus entry carries a
 * certification code and displaying a Cat-certified trust badge on an `NCR`
 * (No Certification) listing would be a false claim.
 *
 * @param {Element} parent
 * @param {{ code?: string }|undefined} certification
 * @param {string} [extraClass]
 * @returns {HTMLElement|undefined}
 */
function addCertifiedBadge(parent, certification, extraClass = '') {
  if (certification?.code !== 'CCU') return undefined;
  const badge = add('span', `pdp-badge pdp-badge-certified ${extraClass}`.trim(), parent);
  add('span', 'pdp-badge-cat', badge, 'CAT');
  const text = add('span', 'pdp-badge-text', badge);
  add('em', null, text, 'Certified');
  add('em', null, text, 'Used');
  return badge;
}

/**
 * Photo groups, in display order. Types come from the feed's `photo/@type`,
 * which survives into the rendered filename as `{sku}_{type}.jpeg`.
 *
 * @type {[string, string[]][]}
 */
const PHOTO_GROUPS = [
  ['Machine Exterior', ['left_front', 'right_front', 'left_rear', 'right_rear']],
  ['Cab', ['cab', 'operator_station', 'interior']],
  ['Engine Compartment', ['engine']],
  ['Undercarriage', ['undercarriage']],
  ['Identification', ['serial_number_plate', 'emissions_plate', 'smh_odometer']],
];

/**
 * Derives the photo type from the rendered image filename.
 * @param {Element} picture
 * @returns {string}
 */
function photoType(picture) {
  const src = picture.querySelector('img')?.getAttribute('src') ?? '';
  return src.match(/_([a-z0-9_]+)\.[a-z]+(?:\?|$)/)?.[1] ?? '';
}

/**
 * Clones a photo for the drawer, lazily loaded so it never competes with the
 * hero for bandwidth.
 * @param {Element} picture
 * @param {{ url: string, title: string }|undefined} video
 * @returns {Element}
 */
function drawerPhoto(picture, video) {
  const clone = picture.cloneNode(true);
  if (!video) return clone;

  const link = document.createElement('button');
  link.className = 'pdp-video-link';
  link.type = 'button';
  link.dataset.videoUrl = video.url;
  link.dataset.videoTitle = video.title;
  link.setAttribute('aria-label', `Play video: ${video.title}`);
  link.append(clone);
  const control = add('span', 'pdp-video-control', link);
  control.append(icon('play'));
  return link;
}

/**
 * Full-screen "View All Images" drawer.
 *
 * Photos are grouped by type; within a group the first is shown full width and
 * the rest two-up, matching the design. Groups with no photos are skipped, so a
 * listing without engine or cab shots simply does not render those headings.
 *
 * @param {HTMLElement[]} pictures
 * @param {string} title
 * @param {Map<HTMLElement, { url: string, title: string }>} videoByPicture
 * @returns {HTMLElement}
 */
function buildGalleryDrawer(pictures, title, videoByPicture, certification) {
  const drawer = document.createElement('dialog');
  drawer.className = 'pdp-drawer';
  drawer.setAttribute('aria-label', `${title} images`);

  const head = add('div', 'pdp-drawer-head', drawer);
  add('h2', 'pdp-drawer-title', head, title);
  const close = add('button', 'pdp-drawer-close', head);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close image gallery');
  close.append(icon('close'));

  const body = add('div', 'pdp-drawer-body', drawer);

  // Drawer media is not part of the initial experience. Build its 30+ lazy
  // pictures only when the viewer explicitly asks for View All.
  drawer.addEventListener('pdp:prepare', () => {
    const meta = add('div', 'pdp-drawer-meta', body);
    addCertifiedBadge(meta, certification);
    const save = add('button', 'pdp-save', meta);
    save.type = 'button';
    save.setAttribute('aria-label', `Save ${title}`);
    save.setAttribute('aria-pressed', 'false');
    save.append(icon('heart'));

    const remaining = [...pictures];
    const addGroup = (label, items) => {
      if (!items.length) return;
      add('h3', 'pdp-drawer-group', body, label);
      const [first, ...rest] = items;
      add('div', 'pdp-drawer-hero', body).append(drawerPhoto(first, videoByPicture.get(first)));
      if (!rest.length) return;
      const grid = add('div', 'pdp-drawer-grid', body);
      rest.forEach((picture) => {
        add('div', 'pdp-drawer-cell', grid).append(drawerPhoto(picture, videoByPicture.get(picture)));
      });
    };

    const videoPictures = remaining.filter((picture) => videoByPicture.has(picture));
    videoPictures.forEach((picture) => remaining.splice(remaining.indexOf(picture), 1));

    PHOTO_GROUPS.forEach(([label, types]) => {
      const items = remaining.filter((picture) => types.includes(photoType(picture)));
      items.forEach((picture) => remaining.splice(remaining.indexOf(picture), 1));
      addGroup(label, items);
    });

    addGroup('Additional Photos', remaining);
    addGroup('Videos', videoPictures);
  }, { once: true });

  return drawer;
}

/**
 * Adds a button that opens the in-page video dialog.
 * @param {Element} parent
 * @param {{ url: string, title: string }} video
 * @param {string} className
 * @param {string} [label]
 * @returns {HTMLElement}
 */
function addVideoButton(parent, video, className) {
  const button = add('button', className, parent);
  button.type = 'button';
  button.dataset.videoUrl = video.url;
  button.dataset.videoTitle = video.title;
  button.setAttribute('aria-label', `Play video: ${video.title}`);
  const control = add('span', 'pdp-video-control', button);
  control.append(icon('play'));
  return button;
}

/**
 * Inline, closable video player. Source is assigned only when a viewer chooses
 * a video, so the browser does not download any large MP4 during initial PDP
 * rendering.
 *
 * @param {string} title
 * @returns {HTMLDialogElement}
 */
function buildVideoDialog(title) {
  const dialog = document.createElement('dialog');
  dialog.className = 'pdp-video-dialog';
  dialog.setAttribute('aria-label', `${title} video player`);

  const head = add('div', 'pdp-dialog-head', dialog);
  add('h2', 'pdp-dialog-title pdp-video-title', head, 'Video');
  const close = add('button', 'pdp-dialog-close', head);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close video player');
  close.append(icon('close'));

  const player = add('video', 'pdp-video-player', dialog);
  player.controls = true;
  player.playsInline = true;
  player.preload = 'metadata';

  return dialog;
}

/* -------------------------------------------------------------------------- */
/* Gallery                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds the gallery from the pictures the pipeline already rendered.
 *
 * The hero `<picture>` is **moved**, never cloned. That preserves the first
 * pipeline image node for EDS's normal section/LCP handling instead of creating
 * a late duplicate that the browser treats as a separate image.
 *
 * @param {HTMLElement[]} pictures
 * @param {string} title
 * @param {Map<HTMLElement, { url: string, title: string }>} [videoByPicture]
 * @returns {HTMLElement}
 */
export function buildGallery(pictures, title, videoByPicture, certification) {
  const gallery = document.createElement('div');
  gallery.className = 'pdp-gallery';

  const hero = add('div', 'pdp-gallery-hero', gallery);

  // A native scroll-snap track, so the drag, momentum, rubber-banding and snap
  // are all the browser's and stay on the compositor. JavaScript only keeps the
  // dots in sync.
  const track = add('div', 'pdp-gallery-track', hero);
  track.tabIndex = 0;
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', `${title} images`);

  pictures.forEach((picture, i) => {
    const slide = add('div', 'pdp-gallery-slide', track);
    if (i === 0) {
      // Moved, never cloned: preserve the pipeline's first image node so EDS
      // can apply its normal first-image LCP handling.
      const img = picture.querySelector('img');
      if (img && !img.getAttribute('alt')) img.setAttribute('alt', title);
      slide.append(picture);
      const video = videoByPicture.get(picture);
      if (video) addVideoButton(slide, video, 'pdp-video-link pdp-video-link-overlay');
      return;
    }
    const clone = picture.cloneNode(true);
    slide.append(clone);
    const video = videoByPicture.get(picture);
    if (video) addVideoButton(slide, video, 'pdp-video-link pdp-video-link-overlay');
  });

  // Outside the track so it stays put while the photos move.
  addCertifiedBadge(hero, certification);

  // Dots centre in the viewport while "View All" sits at the right gutter, so
  // they share one grid row rather than being pulled together by margins.
  const bar = add('div', 'pdp-gallery-bar', gallery);
  const dots = add('div', 'pdp-gallery-dots', bar);
  const prev = add('button', 'pdp-gallery-arrow', dots);
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous image');
  prev.append(icon('chevron'));

  const count = add('output', 'pdp-gallery-count', dots, `1 / ${pictures.length}`);
  count.setAttribute('aria-live', 'polite');

  const next = add('button', 'pdp-gallery-arrow', dots);
  next.type = 'button';
  next.setAttribute('aria-label', 'Next image');
  next.append(icon('chevron'));

  // Every media item gets a desktop shortcut. The rail stays one horizontal row
  // and scrolls rather than wrapping its fifth thumbnail underneath the first
  // four. Video posters use the same rail, marked with a play affordance.
  const thumbs = add('div', 'pdp-gallery-thumbs', gallery);
  pictures.forEach((picture, i) => {
    const video = videoByPicture.get(picture);
    const thumb = add('button', `pdp-thumb${i === 0 ? ' is-active' : ''}${video ? ' is-video' : ''}`, thumbs);
    thumb.type = 'button';
    thumb.setAttribute('aria-label', video ? `Play video: ${video.title}` : `View image ${i + 1}`);
    if (video) {
      thumb.dataset.videoUrl = video.url;
      thumb.dataset.videoTitle = video.title;
    }

    const clone = picture.cloneNode(true);
    thumb.append(clone);
    if (video) {
      const play = add('span', 'pdp-thumb-play', thumb);
      play.append(icon('play'));
    }
  });

  const viewAll = add('button', 'pdp-gallery-viewall', bar, 'View All');
  viewAll.type = 'button';
  viewAll.append(icon('chevron'));

  gallery.append(
    buildGalleryDrawer(pictures, title, videoByPicture, certification),
    buildVideoDialog(title),
  );

  return gallery;
}

/* -------------------------------------------------------------------------- */
/* Purchase card                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Year / hours / ROPS / hydraulic flow, plus the serial number.
 * @param {Element} parent
 * @param {object} custom
 * @param {object} offer
 */
function addSpecStrip(parent, custom, offer) {
  const hours = custom.serviceMeter?.value;
  const specs = [
    ['Year', custom.year],
    ['Hours', Number.isFinite(hours) ? NUM.format(hours) : null],
    // MOCK: ROPS and hydraulic flow are not in the feed.
    ['ROPS', 'Cab'],
    ['Hydraulic Flow', 'Standard Flow'],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  const strip = add('div', 'pdp-specs', parent);
  specs.forEach(([label, value]) => {
    const spec = add('div', 'pdp-spec', strip);
    add('span', 'pdp-spec-label', spec, label);
    add('span', 'pdp-spec-value', spec, value);
  });

  const serial = custom.serialNumber ?? offer.sku;
  if (serial) add('p', 'pdp-sn', strip, `S/N: ${serial}`);
}

/**
 * Dealer card. On mobile this also carries the primary call to action.
 * @param {Element} parent
 * @param {object} custom
 */
function addDealer(parent, custom) {
  const dealer = custom.dealer ?? {};
  const loc = custom.location ?? {};
  const place = [loc.city, loc.state ?? loc.country].filter(Boolean).join(', ');
  const phone = dealer.contact?.phone;
  const name = dealer.name ?? 'Cat Dealer';

  const card = add('div', 'pdp-dealer', parent);
  const brand = add('div', 'pdp-dealer-brand', card);
  add('span', 'pdp-dealer-name', brand, name);

  const logo = add('span', 'pdp-dealer-logo', brand);
  add('span', 'pdp-dealer-logo-text', logo, name.split(' ')[0]);
  add('span', 'pdp-dealer-logo-cat', logo, 'CAT');

  if (place) add('p', 'pdp-dealer-loc', card, place);

  const links = add('p', 'pdp-dealer-links', card);
  const site = add('a', 'pdp-link', links, 'Website');
  site.href = '#website';
  site.prepend(icon('external'));

  if (phone) {
    const call = add('a', 'pdp-link', links, 'Call');
    call.href = `tel:${phone.replace(/\s/g, '')}`;
    call.prepend(icon('phone'));
  }

  const cta = add('button', 'pdp-btn pdp-btn-primary pdp-dealer-cta', card, 'Contact Dealer');
  cta.type = 'button';
}

/**
 * One selectable protection plan or attachment.
 * @param {Element} parent
 * @param {{ name: string, copy: string, price: string, link: string,
 *   selected: boolean, thumb?: boolean, group: string }} config
 */
function addOption(parent, config) {
  const option = add('label', `pdp-option${config.thumb ? ' pdp-option-attachment' : ''}${config.selected ? ' is-selected' : ''}`, parent);

  const input = add('input', 'pdp-option-input', option);
  input.type = 'checkbox';
  input.name = config.group;
  input.checked = config.selected;

  if (config.thumb) {
    add('span', 'pdp-option-thumb', option).setAttribute('aria-hidden', 'true');
  }

  const body = add('div', 'pdp-option-body', option);
  add('span', 'pdp-option-name', body, config.name);
  add('p', 'pdp-option-copy', body, config.copy);
  const more = add('a', 'pdp-link', body, config.link);
  more.href = '#details';

  const aside = add('div', 'pdp-option-aside', option);
  const chip = add('span', 'pdp-chip', aside, 'Selected');
  chip.prepend(icon('check'));
  add('span', 'pdp-option-price', aside, config.price);
}

/**
 * Section heading where "Include " is desktop-only.
 * @param {Element} parent
 * @param {string} rest
 */
function addGroupTitle(parent, rest) {
  const title = add('h2', 'pdp-group-title', parent);
  add('span', 'pdp-group-prefix', title, 'Include ');
  title.append(rest);
}

/**
 * MOCK: protection plans are not in the Product Bus feed.
 * @param {Element} parent
 */
function addProtections(parent, formatter) {
  const group = add('section', 'pdp-group', parent);
  addGroupTitle(group, 'Additional Protections');

  [
    {
      name: 'Customer Value Agreement',
      copy: 'Add a CVA for scheduled maintenance and ongoing protection.',
      selected: true,
    },
    {
      name: 'Equipment Protection Plan',
      copy: 'Add an EPP for extended coverage and budget protection.',
      selected: false,
    },
  ].forEach((plan) => addOption(group, {
    ...plan, price: formatter.format(5000), link: 'Learn More', group: 'protection',
  }));
}

/**
 * MOCK: compatible attachments are not in the Product Bus feed.
 * @param {Element} parent
 */
function addAttachments(parent) {
  const group = add('section', 'pdp-group', parent);
  addGroupTitle(group, 'Compatible Attachments');

  [0, 1, 2].forEach((i) => addOption(group, {
    name: 'Backhoe Bucket',
    copy: '610 mm (24 in), Pin On',
    price: '$XXXX',
    link: 'More Details',
    selected: i === 2,
    thumb: true,
    group: 'attachment',
  }));

  const more = add('a', 'pdp-more', group, 'View more attachments');
  more.href = '#attachments';
  more.append(icon('arrow'));
}

/**
 * @param {object} custom
 * @param {object} offer
 * @param {string} title
 * @returns {HTMLElement}
 */
export function buildPurchaseCard(custom, offer, title) {
  const card = document.createElement('aside');
  card.className = 'pdp-purchase';

  const head = add('div', 'pdp-purchase-head', card);
  addCertifiedBadge(head, custom.condition?.certification, 'pdp-badge-inline');
  const save = add('button', 'pdp-save', head);
  save.type = 'button';
  save.setAttribute('aria-label', `Save ${title}`);
  save.setAttribute('aria-pressed', 'false');
  save.append(icon('heart'));

  const price = Number(offer.price);
  const formatter = money(offer.priceCurrency);
  const priceRow = add('div', 'pdp-price', card);
  add('span', 'pdp-price-label', priceRow, 'Base Price:');
  add('span', 'pdp-price-value', priceRow, Number.isFinite(price) ? formatter.format(price) : 'Call for price');

  addSpecStrip(card, custom, offer);
  addDealer(card, custom);

  const body = add('div', 'pdp-purchase-body', card);
  addProtections(body, formatter);
  addAttachments(body);

  const actions = add('div', 'pdp-actions', card);
  const contact = add('button', 'pdp-btn pdp-btn-primary', actions, 'Contact Dealer');
  contact.type = 'button';
  const saveAll = add('button', 'pdp-btn pdp-btn-secondary', actions, 'Save Selections');
  saveAll.type = 'button';
  saveAll.prepend(icon('bookmark'));

  return card;
}

export { addCertifiedBadge };
