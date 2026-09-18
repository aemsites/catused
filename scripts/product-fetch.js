const PIPELINE_ORIGIN = 'https://main--catused--aemsites.aem.network';
const FCORS_PROXY = 'https://fcors.org/?url=';
const FCORS_KEY = 'lakudfyapuodfyha';

let fetchHost = '';

/**
 * Host used for trusted-origin checks. Workers have no `window`; the page
 * sends its hostname on start.
 * @param {string} host
 */
function setFetchHost(host) {
  fetchHost = String(host || '');
}

/**
 * @returns {string}
 */
function hostname() {
  if (fetchHost) return fetchHost;
  return window.location.hostname;
}

/**
 * Whether this origin can fetch AEM/Cat hosts directly.
 * @returns {boolean}
 */
function isTrustedHost() {
  const host = hostname();
  return host === 'aem.network'
    || host.endsWith('.aem.network')
    || host === 'cat.com'
    || host.endsWith('.cat.com');
}

/**
 * @param {string} url Absolute URL to fetch
 * @returns {string}
 */
function requestUrl(url) {
  return isTrustedHost()
    ? url
    : `${FCORS_PROXY}${encodeURIComponent(url)}&key=${FCORS_KEY}`;
}

/**
 * Fetches JSON, proxying through fcors.org when not on a trusted host.
 * @param {string} url Absolute URL to fetch
 * @returns {Promise<any>}
 */
async function fetchJson(url) {
  const resp = await fetch(requestUrl(url));
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
}

export {
  PIPELINE_ORIGIN,
  fetchJson,
  isTrustedHost,
  requestUrl,
  setFetchHost,
};
