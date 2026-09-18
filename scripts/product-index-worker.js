/* eslint-env worker */
/* eslint-disable no-restricted-globals */
import { fetchJson, setFetchHost } from './product-fetch.js';
import {
  INDEX_CONCURRENCY,
  INDEX_PAGE_SIZE,
  PRODUCTS_INDEX,
  queryProducts,
  sortByImage,
  suggestProducts,
} from './product-catalog.js';

const products = [];
const watches = new Map();
let complete = false;
let loading = false;
let running = false;
let rerun = false;

/**
 * @param {number} offset
 * @returns {string}
 */
function indexPageUrl(offset) {
  const url = new URL(PRODUCTS_INDEX);
  url.searchParams.set('limit', String(INDEX_PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url.href;
}

/**
 * @param {string} name
 * @param {Object} spec
 * @returns {Object}
 */
function runSpec(name, spec) {
  const base = {
    type: 'result',
    name,
    loaded: products.length,
    complete,
  };
  if (spec?.mode === 'suggest') {
    return { ...base, ...suggestProducts(products, spec.q || '') };
  }
  return { ...base, ...queryProducts(products, spec || {}) };
}

async function pumpWatches() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  do {
    rerun = false;
    const snapshot = [...watches.entries()];
    snapshot.forEach(([name, spec]) => {
      postMessage(runSpec(name, spec));
    });
  } while (rerun);
  running = false;
}

/**
 * @param {Array<Object>} chunk
 */
function applyChunk(chunk) {
  if (!chunk.length) return;
  products.push(...chunk);
  sortByImage(products);
  pumpWatches();
}

async function startIndexLoad() {
  if (loading || complete) return;
  loading = true;
  let nextOffset = 0;
  let total = Infinity;

  const worker = async () => {
    while (nextOffset < total) {
      const offset = nextOffset;
      nextOffset += INDEX_PAGE_SIZE;
      // Sliding window: each worker starts the next page as soon as it is free.
      // eslint-disable-next-line no-await-in-loop
      const json = await fetchJson(indexPageUrl(offset));
      const chunk = Array.isArray(json.data) ? json.data : [];
      const reported = Number(json.total);
      if (Number.isFinite(reported) && reported >= 0) {
        total = Math.min(total, reported);
      }
      if (!chunk.length || chunk.length < INDEX_PAGE_SIZE) {
        total = Math.min(total, offset + chunk.length);
      }
      if (offset < total) applyChunk(chunk);
    }
  };

  const workers = Array.from({ length: INDEX_CONCURRENCY }, worker);
  try {
    await Promise.all(workers);
  } catch (error) {
    total = 0;
    await Promise.allSettled(workers);
    // eslint-disable-next-line no-console
    console.error('failed to load products index', error);
  }
  complete = true;
  loading = false;
  pumpWatches();
}

addEventListener('message', (event) => {
  const { data } = event;
  if (!data || typeof data !== 'object') return;
  if (data.hostname) setFetchHost(data.hostname);
  if (data.type === 'start') {
    startIndexLoad();
    return;
  }
  if (data.type === 'watch') {
    watches.set(data.name, data.spec || {});
    startIndexLoad();
    pumpWatches();
    return;
  }
  if (data.type === 'unwatch') {
    watches.delete(data.name);
  }
});
