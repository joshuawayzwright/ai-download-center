const toolGrid = document.getElementById('toolGrid');
const searchInput = document.getElementById('searchInput');
const resultsText = document.getElementById('resultsText');
const countModels = document.getElementById('count-models');
const countCategories = document.getElementById('count-categories');
const filterButtons = document.querySelectorAll('.filter-btn');

let currentFilter = 'all';
let tools = [];

async function loadTools() {
  const response = await fetch('./data/tools.json');
  const data = await response.json();
  tools = data.tools;

  countModels.textContent = tools.length;
  countCategories.textContent = new Set(tools.map((tool) => tool.category)).size;
  renderSpotlightAndRanking();
  renderTools();
}

function renderTools() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filtered = tools.filter((tool) => {
    const matchesFilter = currentFilter === 'all' || tool.category === currentFilter || tool.tags.includes(currentFilter);
    const haystack = [
      tool.name,
      tool.company,
      tool.category,
      tool.description,
      tool.platform,
      tool.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = haystack.includes(searchTerm);
    return matchesFilter && matchesSearch;
  });

  resultsText.textContent = `Showing ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;

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
    const initials = company
      .split(/\s+|[\-&]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'AI';

    return `<span class="company-logo" aria-label="${company} logo">${initials}</span>`;
  };

  toolGrid.innerHTML = filtered
    .map(
      (tool) => `
        <article class="tool-card">
          <div class="card-top">
            <span class="tool-badge">${tool.category}</span>
            <span class="tool-price">${tool.price}</span>
          </div>

          <div>
            <div class="company-row">
              ${makeLogo(tool.company)}
              <div>
                <h3 class="tool-name">${tool.name}</h3>
                <div class="tool-meta">
                  <span>${tool.company}</span>
                  <span>${tool.platform}</span>
                </div>
              </div>
            </div>
          </div>

          <p class="tool-description">${tool.description}</p>

          <div class="tool-meta">
            ${(tool.tags || []).map((tag) => `<span>${tag}</span>`).join('')}
          </div>

          <div class="card-footer">
            <span>${tool.version}</span>
            <a class="card-link" href="${tool.url}" target="_blank" rel="noreferrer">Official source</a>
          </div>
        </article>
      `
    )
    .join('');
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

  const spotlight = tools.find((tool) => tool.category === 'llm') || tools[0];
  const topItems = tools.slice(0, 5);

  spotlightName.textContent = spotlight.name;
  spotlightDescription.textContent = spotlight.description;
  spotlightCategory.textContent = spotlight.category;
  spotlightCompany.textContent = spotlight.company;
  spotlightLink.href = spotlight.url;

  rankList.innerHTML = topItems
    .map(
      (tool, index) => `
        <li class="rank-item">
          <div class="rank-label">
            <strong>${index + 1}</strong>
            <span class="rank-name">${tool.name}</span>
          </div>
          <span>${tool.company}</span>
        </li>
      `
    )
    .join('');
}

searchInput.addEventListener('input', renderTools);

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
    currentFilter = button.dataset.filter;
    renderTools();
  });
});

loadTools();
