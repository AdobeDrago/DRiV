const PAGE_SIZE = 12;

const FUNNEL_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" fill="currentColor"/>
</svg>`;

/**
 * Derive a display category from the article path. All current articles live
 * under tech-tips; extend this map as more content types are added.
 * @param {string} path article path
 * @returns {string} label
 */
function categoryFor(path) {
  if (path.includes('/tech-tips/')) return 'Technical Tips';
  return 'Technical Resources';
}

/**
 * Build a single clickable article card.
 * @param {object} item query-index row
 * @returns {HTMLElement}
 */
function articleCard(item) {
  const card = document.createElement('a');
  card.className = 'article-card';
  card.href = item.path;
  card.innerHTML = `
    <div class="article-card-image">${item.image ? `<img src="${item.image}" alt="" loading="lazy">` : ''}</div>
    <span class="article-card-tag">${categoryFor(item.path)}</span>
    <h3 class="article-card-title">${item.title || ''}</h3>
    <p class="article-card-desc">${item.description || ''}</p>
  `;
  return card;
}

/**
 * Article listing — reads a query-index URL authored in the block, then renders
 * a filterable-ready grid of article cards with a "Load More" pager.
 * @param {Element} block the article-listing block
 */
export default async function decorate(block) {
  // the authored cell holds a link/text pointing at the query-index.json
  const link = block.querySelector('a');
  const src = (link ? link.getAttribute('href') : block.textContent.trim()) || '';
  block.textContent = '';

  // filters placeholder (controls TBD)
  const filters = document.createElement('aside');
  filters.className = 'article-filters';
  filters.innerHTML = `<p class="article-filters-title">${FUNNEL_ICON}<span>Filters</span></p>`;

  // results column: grid + load-more
  const results = document.createElement('div');
  results.className = 'article-results';
  const grid = document.createElement('div');
  grid.className = 'article-grid';
  const pager = document.createElement('div');
  pager.className = 'article-loadmore';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = 'Load More';
  pager.append(button);
  results.append(grid, pager);

  block.append(filters, results);

  let items = [];
  let shown = 0;

  const renderNext = () => {
    items.slice(shown, shown + PAGE_SIZE).forEach((item) => grid.append(articleCard(item)));
    shown = Math.min(shown + PAGE_SIZE, items.length);
    pager.hidden = shown >= items.length;
  };

  try {
    const resp = await fetch(src);
    if (resp.ok) {
      const json = await resp.json();
      items = Array.isArray(json.data) ? json.data : [];
    }
  } catch (e) {
    items = [];
  }

  if (items.length) renderNext();
  else pager.hidden = true;

  button.addEventListener('click', renderNext);
}
