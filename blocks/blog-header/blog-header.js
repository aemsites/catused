import { getMetadata } from '../../scripts/aem.js';

/**
 * @param {string} raw
 * @returns {Date|null}
 */
function parseDate(raw) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function splitTopics(raw) {
  return String(raw || '')
    .split(',')
    .map((topic) => topic.trim())
    .filter(Boolean);
}

/**
 * Renders author, publication date, and topics from page metadata.
 * @param {Element} block
 */
export default function decorate(block) {
  const author = getMetadata('author').trim();
  const publishedRaw = getMetadata('publication-date').trim();
  const topics = splitTopics(getMetadata('topics'));
  const published = parseDate(publishedRaw);

  if (!author && !publishedRaw && !topics.length) {
    block.remove();
    return;
  }

  block.replaceChildren();

  if (publishedRaw) {
    const time = document.createElement('time');
    time.className = 'when';
    if (published) {
      time.dateTime = published.toISOString().slice(0, 10);
      const month = document.createElement('span');
      month.className = 'month';
      month.textContent = published.toLocaleDateString('en-US', { month: 'short' });
      const day = document.createElement('span');
      day.className = 'day';
      day.textContent = String(published.getDate());
      const year = document.createElement('span');
      year.className = 'year';
      year.textContent = String(published.getFullYear());
      time.append(month, day, year);
    } else {
      time.textContent = publishedRaw;
    }
    block.append(time);
  }

  const who = document.createElement('div');
  who.className = 'who';

  if (topics.length) {
    const list = document.createElement('ul');
    list.className = 'topics';
    topics.forEach((topic) => {
      const item = document.createElement('li');
      item.textContent = topic;
      list.append(item);
    });
    who.append(list);
  }

  if (author) {
    const byline = document.createElement('p');
    byline.className = 'author';
    const kicker = document.createElement('span');
    kicker.textContent = 'By';
    byline.append(kicker, document.createTextNode(` ${author}`));
    who.append(byline);
  }

  if (who.childNodes.length) block.append(who);
}
