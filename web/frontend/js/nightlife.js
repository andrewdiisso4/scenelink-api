// Nightlife page JavaScript

let filteredVenues = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadRestaurants();
  displayNightlife();
  setupFilters();
});

function displayNightlife(filters = {}) {
  const container = document.getElementById('nightlifeGrid');
  const countElement = document.getElementById('venueCount');
  
  // Filter venues with Nightlife, Bar, Cocktail, or Club tags
  let venues = SceneLink.restaurants.filter(r => 
    r.tags.some(tag => 
      tag.toLowerCase().includes('nightlife') || 
      tag.toLowerCase().includes('nightclub') ||
      tag.toLowerCase().includes('bar') ||
      tag.toLowerCase().includes('cocktail') ||
      tag.toLowerCase().includes('pub') ||
      tag.toLowerCase().includes('late night')
    )
  );
  
  // Apply filters
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    venues = venues.filter(v => 
      v.name.toLowerCase().includes(searchLower) ||
      v.description.toLowerCase().includes(searchLower) ||
      v.cuisine.toLowerCase().includes(searchLower)
    );
  }
  
  if (filters.venueType) {
    venues = venues.filter(v => 
      v.tags.some(tag => tag.toLowerCase().includes(filters.venueType.toLowerCase())) ||
      v.cuisine.toLowerCase().includes(filters.venueType.toLowerCase())
    );
  }
  
  if (filters.vibe) {
    venues = venues.filter(v => v.crowdLevel.toLowerCase() === filters.vibe.toLowerCase());
  }
  
  if (filters.neighborhood) {
    venues = venues.filter(v => v.neighborhood === filters.neighborhood);
  }
  
  filteredVenues = venues;
  countElement.textContent = venues.length;
  
  if (venues.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🌙</div>
        <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Venues Found</h3>
        <p style="color: var(--text-muted);">Try adjusting your filters to see more nightlife spots</p>
      </div>
    `;
    return;
  }
  
  const html = venues.map(venue => `
    <div class="card" style="position: relative; overflow: hidden;">
      <div style="position: absolute; top: 1rem; right: 1rem; background: rgba(138, 43, 226, 0.9); color: white; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-weight: 600; font-size: 0.85rem; z-index: 1;">
        🌙 NIGHTLIFE
      </div>
      <img src="${venue.image}" alt="${venue.name}" class="card-image" loading="lazy">
      <div class="card-content">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
          <h3 class="card-title" style="margin: 0;">${venue.name}</h3>
          <button class="favorite-btn" data-id="${venue.id}" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0; color: ${isFavorite(venue.id) ? 'var(--gold-primary)' : 'var(--text-muted)'};" title="${isFavorite(venue.id) ? 'Remove from favorites' : 'Add to favorites'}">
            ${isFavorite(venue.id) ? '❤️' : '🤍'}
          </button>
        </div>
        <p class="card-subtitle">${venue.cuisine} • ${venue.neighborhood}</p>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0;">
          ${generateStars(venue.rating)}
          <span class="rating-text">${venue.rating}</span>
          <span style="color: var(--text-muted);">(${venue.reviews} reviews)</span>
        </div>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.5;">
          ${venue.description.substring(0, 120)}...
        </p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${venue.tags.slice(0, 4).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <div style="flex: 1; padding: 0.5rem; background: var(--dark-lighter); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Price</div>
            <div style="color: var(--gold-primary); font-weight: 600;">${'$'.repeat(venue.priceLevel)}</div>
          </div>
          <div style="flex: 1; padding: 0.5rem; background: var(--dark-lighter); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Vibe</div>
            <div style="color: var(--text-primary); font-weight: 600; text-transform: capitalize;">${venue.crowdLevel}</div>
          </div>
        </div>
        <div style="padding: 0.75rem; background: var(--dark-lighter); border-radius: var(--radius-sm); margin-bottom: 1rem;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Hours</div>
          <div style="color: var(--text-primary); font-size: 0.9rem;">${venue.hours}</div>
        </div>
        <a href="restaurant-detail.html?id=${venue.id}" class="btn btn-primary" style="width: 100%; justify-content: center;">
          View Details
        </a>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // Add event listeners for favorite buttons
  container.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = parseInt(btn.dataset.id);
      toggleFavorite(id);
      btn.style.color = isFavorite(id) ? 'var(--gold-primary)' : 'var(--text-muted)';
      btn.innerHTML = isFavorite(id) ? '❤️' : '🤍';
      btn.title = isFavorite(id) ? 'Remove from favorites' : 'Add to favorites';
      
      const message = isFavorite(id) ? 'Added to favorites!' : 'Removed from favorites';
      showNotification(message, 'success');
    });
  });
}

function setupFilters() {
  const searchInput = document.getElementById('nightlifeSearch');
  const venueTypeFilter = document.getElementById('venueTypeFilter');
  const vibeFilter = document.getElementById('vibeFilter');
  const neighborhoodFilter = document.getElementById('neighborhoodFilter');
  
  let searchTimeout;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      applyFilters();
    }, 300);
  });
  
  venueTypeFilter.addEventListener('change', applyFilters);
  vibeFilter.addEventListener('change', applyFilters);
  neighborhoodFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
  const filters = {
    search: document.getElementById('nightlifeSearch').value,
    venueType: document.getElementById('venueTypeFilter').value,
    vibe: document.getElementById('vibeFilter').value,
    neighborhood: document.getElementById('neighborhoodFilter').value
  };
  
  displayNightlife(filters);
}