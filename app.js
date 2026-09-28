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

  toolGrid.innerHTML = filtered
    .map(
      (tool) => `
        <article class="tool-card">
          <div class="card-top">
            <span class="tool-badge">${tool.category}</span>
            <span class="tool-price">${tool.price}</span>
          </div>

          <div>
            <h3 class="tool-name">${tool.name}</h3>
            <div class="tool-meta">
              <span>${tool.company}</span>
              <span>${tool.platform}</span>
            </div>
          </div>

          <p class="tool-description">${tool.description}</p>

          <div class="tool-meta">
            ${tool.tags.map((tag) => `<span>${tag}</span>`).join('')}
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

searchInput.addEventListener('input', renderTools);

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
    currentFilter = button.dataset.filter;
    renderTools();
  });
});

loadTools();
