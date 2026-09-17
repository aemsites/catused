import { loadCopy, hydrateCopy } from '../../scripts/scripts.js';

const INDEX_URL = '/blog/query-index.json?limit=500';
const TOPIC_PREVIEW = 5;

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
 * @param {string} raw
 * @returns {number}
 */
function dateValue(raw) {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * @param {string} path
 * @returns {string}
 */
function articleHref(path) {
  const value = String(path || '').trim();
  if (value.startsWith('/') || value.startsWith('http')) return value;
  return '#';
}

/**
 * Loads the blog query index from the current origin.
 * @returns {Promise<Array<Object>>}
 */
async function loadPosts() {
  try {
    const resp = await fetch(`${window.hlx?.codeBasePath || ''}${INDEX_URL}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    return rows
      .filter((row) => String(row.publicationDate || '').trim())
      .map((row) => ({
        ...row,
        topics: splitTopics(row.topics),
      }))
      .sort((a, b) => dateValue(b.publicationDate) - dateValue(a.publicationDate));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('failed to load blog index', error);
    return [];
  }
}

/**
 * Topics ranked by article count, descending.
 * @param {Array<Object>} posts
 * @returns {Array<{ name: string, count: number }>}
 */
function topicStats(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    post.topics.forEach((topic) => {
      const key = topic.toLowerCase();
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { name: topic, count: 1 });
    });
  });
  return [...counts.values()].sort((a, b) => (
    b.count - a.count || a.name.localeCompare(b.name, 'en')
  ));
}

/**
 * @returns {Set<string>}
 */
function readTopicsParam() {
  const params = new URLSearchParams(window.location.search);
  return new Set(
    params.getAll('topic').flatMap(splitTopics).map((topic) => topic.toLowerCase()),
  );
}

/**
 * @param {Set<string>} selected
 */
function writeTopicsParam(selected) {
  const params = new URLSearchParams(window.location.search);
  params.delete('topic');
  [...selected].forEach((topic) => params.append('topic', topic));
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', url);
}

/**
 * @param {Object} post
 * @param {Object} copy
 * @param {boolean} featured
 * @param {Function} onTopic
 * @returns {HTMLElement}
 */
function renderCard(post, copy, featured, onTopic) {
  const card = document.createElement('article');
  card.className = featured ? 'card lead' : 'card';

  const href = articleHref(post.path);
  const media = document.createElement('a');
  media.className = 'media';
  media.href = href;
  const src = String(post.image || '').trim();
  if (src.startsWith('http') || src.startsWith('/') || src.startsWith('.')) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = post.title || '';
    img.loading = featured ? 'eager' : 'lazy';
    media.append(img);
  }
  if (featured) {
    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.textContent = copy.featured || 'Featured';
    media.append(flag);
  }
  card.append(media);

  const body = document.createElement('div');
  body.className = 'body';

  if (post.topics.length) {
    const list = document.createElement('ul');
    list.className = 'topics';
    post.topics.forEach((topic) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag';
      button.textContent = topic;
      button.addEventListener('click', () => onTopic(topic));
      item.append(button);
      list.append(item);
    });
    body.append(list);
  }

  if (post.publicationDate) {
    const time = document.createElement('time');
    const parsed = new Date(post.publicationDate);
    if (!Number.isNaN(parsed.getTime())) time.dateTime = parsed.toISOString().slice(0, 10);
    time.textContent = post.publicationDate;
    body.append(time);
  }

  const title = document.createElement('h2');
  const titleLink = document.createElement('a');
  titleLink.href = href;
  titleLink.textContent = post.title || post.path || '';
  title.append(titleLink);
  body.append(title);

  if (post.description) {
    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = post.description;
    body.append(desc);
  }

  const more = document.createElement('a');
  more.className = 'more';
  more.href = href;
  more.textContent = copy.readStory || 'Read story';
  body.append(more);

  card.append(body);
  return card;
}

/**
 * Decorates the blog homepage listing widget.
 * @param {Element} widget
 */
export default async function decorate(widget) {
  const [copy, posts] = await Promise.all([
    loadCopy(import.meta.url),
    loadPosts(),
  ]);
  hydrateCopy(widget, copy);

  const feed = widget.querySelector('.feed');
  const empty = widget.querySelector('.empty');
  const filtersEl = widget.querySelector('.filters');
  const countEl = widget.querySelector('.count');
  if (!feed) return;

  let selected = readTopicsParam();
  const topics = topicStats(posts);
  let expanded = topics.slice(TOPIC_PREVIEW).some((topic) => (
    selected.has(topic.name.toLowerCase())
  ));

  const setCount = (count) => {
    if (!countEl) return;
    countEl.textContent = (copy.results || '{count} stories').replace('{count}', String(count));
  };

  const matches = () => {
    if (!selected.size) return posts;
    return posts.filter((post) => post.topics.some((topic) => selected.has(topic.toLowerCase())));
  };

  let paint = () => {};

  const toggleTopic = (topic, on) => {
    const key = String(topic || '').toLowerCase();
    if (!key) {
      selected = new Set();
    } else if (on) selected.add(key);
    else selected.delete(key);
    writeTopicsParam(selected);
    paint();
  };

  const topicLabel = (name, count) => {
    const template = copy.topicCount || '{name} {count}';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag';
    const label = document.createElement('span');
    label.textContent = name;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(count);
    button.append(label, n);
    button.setAttribute('aria-label', template
      .replace('{name}', name)
      .replace('{count}', String(count)));
    return button;
  };

  const visibleTopics = () => {
    if (expanded) return topics;
    const preview = topics.slice(0, TOPIC_PREVIEW);
    topics.slice(TOPIC_PREVIEW).forEach((topic) => {
      if (selected.has(topic.name.toLowerCase())) preview.push(topic);
    });
    return preview;
  };

  const paintFilters = () => {
    if (!filtersEl) return;
    filtersEl.replaceChildren();
    const all = topicLabel(copy.all || 'All', posts.length);
    all.setAttribute('aria-pressed', selected.size ? 'false' : 'true');
    all.addEventListener('click', () => toggleTopic('', false));
    filtersEl.append(all);
    visibleTopics().forEach((topic) => {
      const button = topicLabel(topic.name, topic.count);
      const on = selected.has(topic.name.toLowerCase());
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.addEventListener('click', () => toggleTopic(topic.name, !on));
      filtersEl.append(button);
    });
    if (topics.length > TOPIC_PREVIEW) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more-topics';
      more.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      more.textContent = expanded
        ? (copy.fewerTopics || 'Fewer topics')
        : (copy.moreTopics || 'More topics…');
      more.addEventListener('click', () => {
        expanded = !expanded;
        paintFilters();
      });
      filtersEl.append(more);
    }
  };

  paint = () => {
    const shown = matches();
    feed.replaceChildren();
    shown.forEach((post, index) => {
      feed.append(renderCard(post, copy, index === 0, (topic) => {
        selected = new Set([topic.toLowerCase()]);
        writeTopicsParam(selected);
        paint();
      }));
    });
    if (empty) empty.hidden = shown.length > 0;
    setCount(shown.length);
    paintFilters();
  };

  paint();
}
