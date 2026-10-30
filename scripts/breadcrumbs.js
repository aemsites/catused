import { matchCategoryPath } from './product-index.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

/**
 * Resolves category ancestors from the sheet, not from guessed URL labels.
 * @param {Array<{ path: string, title: string }>} categories
 * @param {{ pathname?: string, categoryTitle?: string, productTitle?: string }} options
 * @returns {Array<{ title: string, href?: string }>}
 */
export function breadcrumbItems(categories, {
  pathname = window.location.pathname,
  categoryTitle = '',
  productTitle = '',
} = {}) {
  const rows = categories.filter((row) => row.path && row.title);
  let category = matchCategoryPath(pathname.replace(/\.html\/?$/, ''), rows);
  if (!category && productTitle && categoryTitle) {
    const matches = rows.filter((row) => normalize(row.title) === normalize(categoryTitle));
    if (matches.length === 1) [category] = matches;
  }
  if (!category && !productTitle) return [];

  const items = [{ title: 'Home', href: '/' }];
  if (category) {
    const path = normalize(category.path);
    const parts = path.split('/');
    parts.forEach((part, index) => {
      const ancestorPath = parts.slice(0, index + 1).join('/');
      const ancestor = rows.find((row) => normalize(row.path) === ancestorPath);
      if (ancestor) {
        items.push({ title: ancestor.title, href: `/categories/${ancestorPath}` });
      }
    });
  }
  if (productTitle) items.push({ title: productTitle });
  delete items[items.length - 1].href;
  return items;
}

/**
 * Builds an accessible trail shared by category listings and product pages.
 * @param {Array<{ path: string, title: string }>} categories
 * @param {{ pathname?: string, categoryTitle?: string, productTitle?: string }} options
 * @returns {Promise<HTMLElement|null>}
 */
export default async function buildBreadcrumbs(categories, options) {
  const items = breadcrumbItems(categories, options);
  if (!items.length) return null;
  const { loadCSS } = await import('./aem.js');
  await loadCSS(`${window.hlx?.codeBasePath || ''}/styles/breadcrumbs.css`);
  const nav = document.createElement('nav');
  nav.className = 'breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');
  const list = document.createElement('ol');
  items.forEach(({ title, href }, index) => {
    const item = document.createElement('li');
    const label = document.createElement(href ? 'a' : 'span');
    label.textContent = title;
    if (href) label.href = href;
    if (index === items.length - 1) label.setAttribute('aria-current', 'page');
    item.append(label);
    list.append(item);
  });
  nav.append(list);
  return nav;
}
