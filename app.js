const toolGrid = document.getElementById('toolGrid');
const searchInput = document.getElementById('searchInput');
const resultsText = document.getElementById('resultsText');
const countModels = document.getElementById('count-models');
const countCategories = document.getElementById('count-categories');
const filterButtons = document.querySelectorAll('.filter-btn');
const liveSearchStatus = document.getElementById('liveSearchStatus');
const loadMoreModels = document.getElementById('loadMoreModels');

let currentFilter = 'all';
let tools = [];
let curatedTools = [];
let liveTools = [];
let liveSearchTimer;
let liveSearchController;
let liveSearchRequest = 0;
let liveSearchQuery = '';
let liveNextPageUrl = null;
const catalogCacheKey = 'ai-download-center:catalog:v1';

const taskCategories = {
  'automatic-speech-recognition': 'audio',
  'audio-classification': 'audio',
  'audio-to-audio': 'audio',
  'text-to-audio': 'audio',
  'text-to-speech': 'audio',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'text-to-image': 'image',
  'image-to-image': 'image',
  'unconditional-image-generation': 'image',
  'image-classification': 'vision',
  'image-segmentation': 'vision',
  'object-detection': 'vision',
  'depth-estimation': 'vision',
  'visual-question-answering': 'vision',
  'image-to-text': 'vision',
  conversational: 'chatbot',
};

const taskDescriptions = {
  'automatic-speech-recognition': 'Speech recognition model',
  'audio-classification': 'Audio classification model',
  'audio-to-audio': 'Audio transformation model',
  'text-to-audio': 'Text-to-audio generation model',
  'text-to-speech': 'Speech generation model',
  'text-to-video': 'Text-to-video generation model',
  'image-to-video': 'Image-to-video generation model',
  'text-to-image': 'Text-to-image generation model',
  'image-to-image': 'Image transformation model',
  'unconditional-image-generation': 'Image generation model',
  'image-classification': 'Image classification model',
  'image-segmentation': 'Image segmentation model',
  'object-detection': 'Object detection model',
  'depth-estimation': 'Depth estimation model',
  'visual-question-answering': 'Visual question answering model',
  'image-to-text': 'Image captioning model',
  conversational: 'Conversational model',
  'text-generation': 'Text generation model',
  'text2text-generation': 'Text-to-text generation model',
  'sentence-similarity': 'Text embedding and similarity model',
  'feature-extraction': 'Feature extraction model',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function normalizeSearchText(value) {
  return String(value ?? '').toLowerCase().replace(/[-_./]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toCommunityModel(model) {
  const modelTags = Array.isArray(model.tags) ? model.tags : [];
  const modelId = String(model.id || 'Unknown model');
  const company = String(model.author || modelId.split('/')[0] || 'Hugging Face');
  const taggedTask = modelTags.find((tag) => taskCategories[tag]);
  const modelTask = model.pipeline_tag || taggedTask;
  const searchableMetadata = `${modelId} ${modelTags.join(' ')}`.toLowerCase();
  let category = taskCategories[modelTask] || 'llm';

  if (!taskCategories[modelTask]) {
    if (searchableMetadata.includes('diffusion') || searchableMetadata.includes('text-to-image') || searchableMetadata.includes('flux')) {
      category = 'image';
    } else if (searchableMetadata.includes('text-to-video') || searchableMetadata.includes('video')) {
      category = 'video';
    } else if (searchableMetadata.includes('speech') || searchableMetadata.includes('audio') || searchableMetadata.includes('whisper')) {
      category = 'audio';
    } else if (searchableMetadata.includes('object-detection') || searchableMetadata.includes('segmentation') || searchableMetadata.includes('vision')) {
      category = 'vision';
    } else if (searchableMetadata.includes('code') || searchableMetadata.includes('coder')) {
      category = 'code';
    }
  }

  const task = modelTask || category;
  const licenseTag = modelTags.find((tag) => tag.startsWith('license:'));
  const tags = [...new Set(['community', 'hugging-face', task, ...modelTags.slice(0, 3)])].slice(0, 6);
  const modelPath = modelId.split('/').map((part) => encodeURIComponent(part)).join('/');
  const downloads = Number(model.downloads || 0).toLocaleString();
  const categoryDescriptions = {
    audio: 'Audio model',
    chatbot: 'Conversational model',
    code: 'Code model',
    image: 'Image generation model',
    llm: 'Text generation model',
    video: 'Video generation model',
    vision: 'Computer vision model',
  };

  return {
    name: modelId,
    company,
    category,
    platform: 'Hugging Face',
    version: model.lastModified ? `Updated ${model.lastModified.slice(0, 10)}` : 'Community model',
    price: licenseTag ? licenseTag.slice('license:'.length) : 'Review license',
    tags,
    description: `${taskDescriptions[modelTask] || categoryDescriptions[category] || `${task.replaceAll('-', ' ')} model`}. ${downloads} downloads on Hugging Face.`,
    url: `https://huggingface.co/${modelPath}`,
    source: 'hugging-face',
  };
}

function setLiveSearchStatus(message) {
  if (!liveSearchStatus) return;
  liveSearchStatus.textContent = message;
  liveSearchStatus.hidden = !message;
}

function getNextModelPage(linkHeader) {
  const nextLink = linkHeader?.match(/<([^>]+)>\s*;\s*rel="next"/);
  return nextLink?.[1] || null;
}

async function loadTools() {
  toolGrid.setAttribute('aria-busy', 'true');
  let data;
  let usingCachedCatalog = false;

  try {
    const response = await fetch('./data/tools.json?v=20260930-shareable1');
    if (!response.ok) throw new Error(`Catalog request returned ${response.status}`);
    data = await response.json();
    try {
      localStorage.setItem(catalogCacheKey, JSON.stringify(data));
    } catch (cacheError) {
      console.warn('Catalog cache could not be saved:', cacheError);
    }
  } catch (error) {
    console.error('Catalog failed to load:', error);
    try {
      const cachedData = JSON.parse(localStorage.getItem(catalogCacheKey) || 'null');
      if (Array.isArray(cachedData?.tools) && cachedData.tools.length) {
        data = cachedData;
        usingCachedCatalog = true;
      }
    } catch (cacheError) {
      console.warn('Cached catalog is unavailable:', cacheError);
    }

    if (!data) {
      resultsText.textContent = 'Catalog unavailable';
      toolGrid.innerHTML = `
        <div class="empty-state">
          <h3>Catalog temporarily unavailable</h3>
          <p>Check your connection and try again.</p>
          <button class="secondary-btn" id="retryCatalog" type="button">Retry catalog</button>
        </div>
      `;
      document.getElementById('retryCatalog')?.addEventListener('click', () => loadTools(), { once: true });
      toolGrid.removeAttribute('aria-busy');
      return;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get('filter');
  const requestedSearch = params.get('q') || '';

  if (requestedFilter && [...filterButtons].some((button) => button.dataset.filter === requestedFilter)) {
    currentFilter = requestedFilter;
  }
  searchInput.value = requestedSearch;

  // Sponsored listings always come first; the sort is stable, so the rest keep their order.
  curatedTools = [...data.tools].sort((a, b) => Number(Boolean(b.sponsored)) - Number(Boolean(a.sponsored)));
  tools = [...curatedTools, ...liveTools];

  countModels.textContent = curatedTools.length;
  countCategories.textContent = new Set(curatedTools.map((tool) => tool.category)).size;
  document.querySelectorAll('[data-count-for]').forEach((element) => {
    const count = curatedTools.filter((tool) => matchesFilter(tool, element.dataset.countFor)).length;
    element.textContent = `${count} listings`;
  });
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === currentFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderSpotlightAndRanking();
  renderTools();
  toolGrid.removeAttribute('aria-busy');
  if (usingCachedCatalog) setLiveSearchStatus('Offline mode: showing the last saved catalog.');

  if (requestedSearch.trim().length >= 2) {
    liveSearchQuery = requestedSearch.trim();
    liveSearchTimer = setTimeout(() => searchLiveModels(liveSearchQuery), 350);
  }
}

// A filter is 'all' or a space-separated list of categories/tags; a tool matches if it has any of them.
function matchesFilter(tool, filter) {
  if (filter === 'all') return true;
  return filter.split(' ').some((value) => tool.category === value || (tool.tags || []).includes(value));
}

function syncUrlState({ replace = false } = {}) {
  const params = new URLSearchParams();
  if (currentFilter !== 'all') params.set('filter', currentFilter);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

function setFilter(filter, options = {}) {
  currentFilter = filter;
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderTools();
  syncUrlState(options);
}

function renderTools() {
  const searchTerm = normalizeSearchText(searchInput.value);
  const filtered = tools.filter((tool) => {
    const matchesCategory = matchesFilter(tool, currentFilter);
    const haystack = [
      tool.name,
      tool.company,
      tool.category,
      tool.description,
      tool.platform,
      (tool.tags || []).join(' '),
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = normalizeSearchText(haystack).includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  const liveCount = filtered.filter((tool) => tool.source === 'hugging-face').length;
  resultsText.textContent = `Showing ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}${liveCount ? `, including ${liveCount} live models` : ''}`;

  if (!filtered.length) {
    toolGrid.innerHTML = `
      <div class="empty-state">
        <h3>No matches found</h3>
        <p>Try a different search term or switch back to the full catalog.</p>
      </div>
    `;
    return;
  }

  const makeLogo = (company) => {
    const initials = String(company)
      .split(/\s+|[\-&]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'AI';

    return `<span class="company-logo" aria-label="${escapeHtml(company)} logo">${escapeHtml(initials)}</span>`;
  };

  toolGrid.innerHTML = filtered
    .map(
      (tool) => `
        <article class="tool-card${tool.sponsored ? ' is-sponsored' : ''}">
          <div class="card-top">
            <span class="card-badges">
              <span class="tool-badge">${escapeHtml(tool.category)}</span>
              ${tool.sponsored ? '<span class="sponsored-badge">Sponsored</span>' : ''}
            </span>
            <span class="tool-price">${escapeHtml(tool.price)}</span>
          </div>

          <div>
            <div class="company-row">
              ${makeLogo(tool.company)}
              <div>
                <h3 class="tool-name">${escapeHtml(tool.name)}</h3>
                <div class="tool-meta">
                  <span>${escapeHtml(tool.company)}</span>
                  <span>${escapeHtml(tool.platform)}</span>
                </div>
              </div>
            </div>
          </div>

          <p class="tool-description">${escapeHtml(tool.description)}</p>

          <div class="tool-meta">
            ${(tool.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
          </div>

          <div class="card-footer">
            <span>${escapeHtml(tool.version)}</span>
              <a class="card-link" href="${escapeHtml(tool.affiliateUrl || tool.url)}" target="_blank" rel="${tool.affiliateUrl ? 'sponsored noopener' : 'noreferrer'}" aria-label="${escapeHtml(tool.name)} ${tool.source === 'hugging-face' ? 'model card' : tool.category === 'android' ? 'APK download page' : 'official site'} (opens in a new tab)">${tool.source === 'hugging-face' ? 'Model card' : tool.category === 'android' ? 'Download APK' : 'Official source'}</a>
          </div>
        </article>
      `
    )
    .join('');
}

async function searchLiveModels(query, pageUrl = null) {
  const requestId = ++liveSearchRequest;
  liveSearchController?.abort();
  liveSearchController = new AbortController();
  const loadingNextPage = Boolean(pageUrl);
  loadMoreModels.disabled = true;
  setLiveSearchStatus(loadingNextPage ? 'Loading more community models...' : 'Searching live community models...');

  try {
    const parameters = new URLSearchParams({ search: query, sort: 'downloads', direction: '-1', limit: '100' });
    const requestUrl = pageUrl || `https://huggingface.co/api/models?${parameters}`;
    const response = await fetch(requestUrl, { signal: liveSearchController.signal });
    if (!response.ok) throw new Error(`Model registry returned ${response.status}`);

    const models = await response.json();
    if (requestId !== liveSearchRequest || searchInput.value.trim() !== query) return;

    const curatedNames = new Set(curatedTools.map((tool) => tool.name.toLowerCase()));
    const knownNames = new Set([...curatedNames, ...liveTools.map((tool) => tool.name.toLowerCase())]);
    const pageTools = models
      .filter((model) => !curatedNames.has(String(model.id).toLowerCase()))
      .map(toCommunityModel);
    const uniquePageTools = pageTools.filter((tool) => {
      const key = tool.name.toLowerCase();
      if (knownNames.has(key)) return false;
      knownNames.add(key);
      return true;
    });
    liveTools = loadingNextPage ? [...liveTools, ...uniquePageTools] : uniquePageTools;
    liveNextPageUrl = getNextModelPage(response.headers.get('Link'));
    tools = [...curatedTools, ...liveTools];
    renderTools();
    loadMoreModels.hidden = !liveNextPageUrl;
    setLiveSearchStatus(`Loaded ${liveTools.length} live models from Hugging Face.`);
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== liveSearchRequest) return;
    setLiveSearchStatus(loadingNextPage
      ? 'Could not load more live models. You can retry.'
      : 'Live model search is unavailable; curated results are still shown.');
  } finally {
    if (requestId === liveSearchRequest) loadMoreModels.disabled = false;
  }
}

function handleSearchInput() {
  clearTimeout(liveSearchTimer);
  liveSearchController?.abort();
  liveSearchRequest += 1;
  liveTools = [];
  liveSearchQuery = '';
  liveNextPageUrl = null;
  loadMoreModels.hidden = true;
  loadMoreModels.disabled = false;
  tools = [...curatedTools];
  setLiveSearchStatus('');
  renderTools();
  syncUrlState({ replace: true });

  const query = searchInput.value.trim();
  if (query.length < 2) return;
  liveSearchQuery = query;
  liveSearchTimer = setTimeout(() => searchLiveModels(query), 350);
}

function restoreUrlState() {
  const params = new URLSearchParams(window.location.search);
  const requestedFilter = params.get('filter');
  const requestedSearch = params.get('q') || '';
  if (requestedFilter && [...filterButtons].some((button) => button.dataset.filter === requestedFilter)) {
    currentFilter = requestedFilter;
  } else {
    currentFilter = 'all';
  }
  searchInput.value = requestedSearch;
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === currentFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderTools();
}

function renderSpotlightAndRanking() {
  const spotlightName = document.getElementById('spotlightName');
  const spotlightDescription = document.getElementById('spotlightDescription');
  const spotlightCategory = document.getElementById('spotlightCategory');
  const spotlightCompany = document.getElementById('spotlightCompany');
  const spotlightLink = document.getElementById('spotlightLink');
  const rankList = document.getElementById('rankList');

  if (!spotlightName || !spotlightDescription || !spotlightCategory || !spotlightCompany || !spotlightLink || !rankList) {
    return;
  }

  // Editorial picks are never paid placements.
  const editorial = curatedTools.filter((tool) => !tool.sponsored);
  const spotlight = editorial.find((tool) => tool.category === 'llm') || editorial[0];
  const topItems = editorial.slice(0, 5);

  spotlightName.textContent = spotlight.name;
  spotlightDescription.textContent = spotlight.description;
  spotlightCategory.textContent = spotlight.category;
  spotlightCompany.textContent = spotlight.company;
  spotlightLink.href = spotlight.affiliateUrl || spotlight.url;

  rankList.innerHTML = topItems
    .map(
      (tool, index) => `
        <li class="rank-item">
          <div class="rank-label">
            <strong>${index + 1}</strong>
            <span class="rank-name">${escapeHtml(tool.name)}</span>
          </div>
          <span>${escapeHtml(tool.company)}</span>
        </li>
      `
    )
    .join('');
}

function setupListingLinks() {
  const config = window.SITE_CONFIG || {};
  const repoUrl = config.repoUrl || 'https://github.com/joshuawayzwright/ai-download-center';
  document.getElementById('submitToolLink').href = `${repoUrl}/issues/new?template=submit-tool.yml`;
  document.getElementById('featuredLink').href = config.featuredCheckoutUrl || `${repoUrl}/issues/new?template=featured-listing.yml`;
  if (config.featuredPrice) document.getElementById('featuredPrice').textContent = config.featuredPrice;
  if (config.featuredPeriod) document.getElementById('featuredPeriod').textContent = config.featuredPeriod;
}

setupListingLinks();
searchInput.addEventListener('input', handleSearchInput);
loadMoreModels.addEventListener('click', () => {
  if (liveSearchQuery && liveNextPageUrl) {
    searchLiveModels(liveSearchQuery, liveNextPageUrl);
  }
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setFilter(button.dataset.filter));
});

document.querySelectorAll('[data-collection]').forEach((card) => {
  card.addEventListener('click', () => setFilter(card.dataset.collection));
});

window.addEventListener('popstate', restoreUrlState);

loadTools();
