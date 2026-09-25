/**
 * Saved equipment. Newest first, capped so the list stays small.
 */

const STORAGE_KEY = 'catused-likes';
const SEARCH_KEY = 'catused-searches';
const MAX_LIKES = 20;

export const LIKES_EVENT = 'catused:likes';

/**
 * @returns {Array<object>}
 */
export function readLikes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && item.id && item.likedAt);
  } catch {
    return [];
  }
}

/**
 * @param {Array<object>} likes
 */
function writeLikes(likes, detail) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(likes.slice(0, MAX_LIKES)));
  window.dispatchEvent(new CustomEvent(LIKES_EVENT, { detail }));
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isLiked(id) {
  return readLikes().some((item) => item.id === id);
}

/**
 * Stores a like at the front of the list. Re-saving the same machine moves it
 * to the front and refreshes the time.
 * @param {object} like
 */
export function saveLike(like) {
  const next = [
    like,
    ...readLikes().filter((item) => item.id !== like.id),
  ].slice(0, MAX_LIKES);
  writeLikes(next, { added: true });
}

/**
 * @param {string} id
 */
export function removeLike(id) {
  writeLikes(readLikes().filter((item) => item.id !== id));
}

/**
 * @returns {Array<object>}
 */
export function readSearches() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && item.id && item.likedAt);
  } catch {
    return [];
  }
}

/**
 * @param {Array<object>} searches
 * @param {object} [detail]
 */
function writeSearches(searches, detail) {
  localStorage.setItem(SEARCH_KEY, JSON.stringify(searches.slice(0, MAX_LIKES)));
  window.dispatchEvent(new CustomEvent(LIKES_EVENT, { detail }));
}

/**
 * @param {object} search
 */
export function saveSearch(search) {
  const next = [
    { ...search, kind: 'search' },
    ...readSearches().filter((item) => item.id !== search.id),
  ].slice(0, MAX_LIKES);
  writeSearches(next, { added: true });
}

/**
 * @param {string} id
 */
export function removeSearch(id) {
  writeSearches(readSearches().filter((item) => item.id !== id));
}

/**
 * Newest likes and saved searches, for the account menu.
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function readRecent(limit = 3) {
  return [...readLikes(), ...readSearches()]
    .sort((a, b) => b.likedAt - a.likedAt)
    .slice(0, limit);
}

/**
 * @param {number} likedAt
 * @returns {string}
 */
export function formatLikedAt(likedAt) {
  const elapsed = Math.max(0, Date.now() - Number(likedAt));
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < 45 * 1000) return 'just now';
  if (elapsed < hour) return `${Math.round(elapsed / minute)}m ago`;
  if (elapsed < day) return `${Math.round(elapsed / hour)}h ago`;
  if (elapsed < 14 * day) return `${Math.round(elapsed / day)}d ago`;
  return new Date(likedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
