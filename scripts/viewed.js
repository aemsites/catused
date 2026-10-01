/**
 * Product pages the visitor opened. Newest first, and only the last two —
 * recommendations should follow what they just looked at, not a long trail.
 */

const STORAGE_KEY = 'catused-viewed';
const MAX_VIEWED = 2;

/**
 * @returns {Array<object>}
 */
export function readViewed() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && item.id && item.viewedAt);
  } catch {
    return [];
  }
}

/**
 * Stores a viewed PDP at the front of the list. Opening the same machine
 * again refreshes it and keeps it as one of the two.
 * @param {object} entry
 */
export function saveViewed(entry) {
  if (!entry || !entry.id) return;
  const next = [
    { ...entry, viewedAt: entry.viewedAt || Date.now() },
    ...readViewed().filter((item) => item.id !== entry.id),
  ].slice(0, MAX_VIEWED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
