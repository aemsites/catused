import assert from 'node:assert/strict';
import test from 'node:test';
import { breadcrumbItems } from '../scripts/breadcrumbs.js';

const categories = [
  { path: 'construction', title: 'Construction' },
  { path: 'construction/crawler-excavators', title: 'Crawler Excavators' },
  { path: 'construction/crawler-excavators/mini', title: 'Mini Excavators' },
  { path: 'forestry', title: 'Forestry' },
];

test('category PLP links ancestors and leaves the current page unlinked', () => {
  assert.deepEqual(breadcrumbItems(categories, {
    pathname: '/categories/construction/crawler-excavators',
  }), [
    { title: 'Home', href: '/' },
    { title: 'Construction', href: '/categories/construction' },
    { title: 'Crawler Excavators' },
  ]);
});

test('top-level category, trailing slash, and HTML suffix resolve', () => {
  ['/categories/construction', '/categories/construction/', '/categories/construction.html']
    .forEach((pathname) => {
      assert.deepEqual(breadcrumbItems(categories, { pathname }), [
        { title: 'Home', href: '/' },
        { title: 'Construction' },
      ]);
    });
});

test('nested categories use the longest matching path', () => {
  assert.deepEqual(breadcrumbItems(categories, {
    pathname: '/categories/construction/crawler-excavators/mini',
  }).map((item) => item.title), ['Home', 'Construction', 'Crawler Excavators', 'Mini Excavators']);
});

test('PDP family matching links the category and appends the product name', () => {
  assert.deepEqual(breadcrumbItems(categories, {
    pathname: '/products/cat-320',
    categoryTitle: ' crawler excavators ',
    productTitle: 'CAT 320',
  }), [
    { title: 'Home', href: '/' },
    { title: 'Construction', href: '/categories/construction' },
    { title: 'Crawler Excavators', href: '/categories/construction/crawler-excavators' },
    { title: 'CAT 320' },
  ]);
});

test('missing category ancestors are not invented', () => {
  assert.deepEqual(breadcrumbItems(categories.slice(1), {
    pathname: '/categories/construction/crawler-excavators',
  }), [
    { title: 'Home', href: '/' },
    { title: 'Crawler Excavators' },
  ]);
});

test('unknown, missing, ambiguous, or unavailable PDP categories keep a minimal trail', () => {
  [
    { rows: categories, family: 'Unknown' },
    { rows: categories, family: '' },
    { rows: [], family: 'Crawler Excavators' },
    {
      rows: [...categories, { path: 'forestry/excavators', title: 'Crawler Excavators' }],
      family: 'Crawler Excavators',
    },
  ].forEach(({ rows, family }) => {
    assert.deepEqual(breadcrumbItems(rows, {
      pathname: '/products/cat-320',
      categoryTitle: family,
      productTitle: 'CAT 320',
    }), [{ title: 'Home', href: '/' }, { title: 'CAT 320' }]);
  });
});

test('unrelated and unknown category pages do not get a misleading trail', () => {
  ['/search', '/categories/unknown', '/categories/construction-other'].forEach((pathname) => {
    assert.deepEqual(breadcrumbItems(categories, { pathname }), []);
  });
});

test('incomplete category rows are ignored', () => {
  assert.deepEqual(breadcrumbItems([{}, { path: 'construction' }, ...categories], {
    pathname: '/categories/construction',
  }), [{ title: 'Home', href: '/' }, { title: 'Construction' }]);
});
