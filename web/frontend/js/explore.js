// Explore page JavaScript

let currentView = 'list';
let filteredRestaurants = [];

document.addEventListener('DOMContentLoaded', async () => {
  const restaurants = await loadRestaurants();
  filteredRestaurants = restaurants;
  displayRestaurants(restaurants);
  updateResultCount(restaurants.length);
  
  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  
  // Filter toggle
  const filterBtn = document.getElementById('filterBtn');
  const filterPanel = document.getElementById('filterPanel');
  filterBtn.addEventListener('click', () => {
    filterPanel.classList.toggle('hidden');
  });
  
  // Apply filters
  document.getElementById('applyFilters').addEventListener('click', applyFilters);
  document.getElementById('clearFilters').addEventListener('click', clearFilters);
  
  // View toggle
  document.getElementById('mapViewBtn').addEventListener('click', () => switchView('map'));
  document.getElementById('listViewBtn').addEventListener('click', () => switchView('list'));
  
  // Modal
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('quickViewModal').addEventListener('click', (e) => {
    if (e.target.id === 'quickViewModal') closeModal();
  });
}

function handleSearch(e) {
  const query = e.target.value;
  const filters = getCurrentFilters();
  filters.search = query;
  
  const results = filterRestaurants(filters);
  filteredRestaurants = results;
  displayRestaurants(results);
  updateResultCount(results.length);
}

function getCurrentFilters() {
  return {
    cuisine: document.getElementById('cuisineFilter').value,
    neighborhood: document.getElementById('neighborhoodFilter').value,
    priceLevel: document.getElementById('priceFilter').value,
    rating: parseFloat(document.getElementById('ratingFilter').value) || 0,
    search: document.getElementById('searchInput').value
  };
}

function applyFilters() {
  const filters = getCurrentFilters();
  const results = filterRestaurants(filters);
  filteredRestaurants = results;
  displayRestaurants(results);
  updateResultCount(results.length);
  showNotification('Filters applied successfully!');
}

function clearFilters() {
  document.getElementById('cuisineFilter').value = '';
  document.getElementById('neighborhoodFilter').value = '';
  document.getElementById('priceFilter').value = '';
  document.getElementById('ratingFilter').value = '';
  document.getElementById('searchInput').value = '';
  
  filteredRestaurants = SceneLink.restaurants;
  displayRestaurants(SceneLink.restaurants);
  updateResultCount(SceneLink.restaurants.length);
  showNotification('Filters cleared');
}

function displayRestaurants(restaurants) {
  if (currentView === 'list') {
    displayListView(restaurants);
  } else {
    displayMapView(restaurants);
  }
}

function displayListView(restaurants) {
  const container = document.getElementById('restaurantList');
  const emptyState = document.getElementById('emptyState');
  
  if (restaurants.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    container.innerHTML = restaurants.map(r => createRestaurantListItem(r)).join('');
    
    // Add click handlers for restaurant items
    container.querySelectorAll('.restaurant-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.favorite-btn') && !e.target.closest('.btn')) {
          const id = item.dataset.restaurantId;
          window.location.href = `restaurant-detail.html?id=${id}`;
        }
      });
    });
  }
}

function displayMapView(restaurants) {
  const mapMarkers = document.getElementById('mapMarkers');
  mapMarkers.innerHTML = '';
  
  restaurants.forEach((restaurant, index) => {
    const marker = createMapMarker(restaurant, index);
    mapMarkers.appendChild(marker);
  });
}

function createMapMarker(restaurant, index) {
  const marker = document.createElement('div');
  const total = filteredRestaurants.length;
  
  // Distribute markers across the map area
  const row = Math.floor(index / 4);
  const col = index % 4;
  const left = 15 + (col * 20) + (Math.random() * 10);
  const top = 15 + (row * 20) + (Math.random() * 10);
  
  marker.style.cssText = `
    position: absolute;
    left: ${left}%;
    top: ${top}%;
    width: 40px;
    height: 40px;
    background: var(--gold-primary);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
    z-index: ${100 - index};
  `;
  
  marker.innerHTML = `
    <span style="transform: rotate(45deg); font-size: 1.2rem;">🍽️</span>
  `;
  
  marker.addEventListener('mouseenter', () => {
    marker.style.transform = 'rotate(-45deg) scale(1.2)';
    marker.style.zIndex = '1000';
  });
  
  marker.addEventListener('mouseleave', () => {
    marker.style.transform = 'rotate(-45deg) scale(1)';
    marker.style.zIndex = `${100 - index}`;
  });
  
  marker.addEventListener('click', () => {
    showQuickView(restaurant);
  });
  
  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: rgba(26, 26, 26, 0.95);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    white-space: nowrap;
    font-size: 0.9rem;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    border: 1px solid rgba(212, 175, 55, 0.3);
  `;
  tooltip.textContent = restaurant.name;
  marker.appendChild(tooltip);
  
  marker.addEventListener('mouseenter', () => {
    tooltip.style.opacity = '1';
  });
  
  marker.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });
  
  return marker;
}

function showQuickView(restaurant) {
  const modal = document.getElementById('quickViewModal');
  const modalName = document.getElementById('modalRestaurantName');
  const modalBody = document.getElementById('modalBody');
  
  modalName.textContent = restaurant.name;
  
  modalBody.innerHTML = `
    <img src="${restaurant.image}" alt="${restaurant.name}" style="width: 100%; height: 300px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
      <div>
        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.25rem;">Cuisine</div>
        <div style="font-weight: 600;">${restaurant.cuisine}</div>
      </div>
      <div>
        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.25rem;">Location</div>
        <div style="font-weight: 600;">${restaurant.location}</div>
      </div>
      <div>
        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.25rem;">Price Level</div>
        <div style="font-weight: 600;">${restaurant.priceLevel}</div>
      </div>
      <div>
        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.25rem;">Hours</div>
        <div style="font-weight: 600;">${restaurant.hours}</div>
      </div>
    </div>
    
    <div class="rating" style="margin-bottom: 1rem;">
      ${generateStars(restaurant.rating)}
      <span class="rating-text">${restaurant.rating} (${restaurant.reviewCount} reviews)</span>
    </div>
    
    <div class="card-tags" style="margin-bottom: 1.5rem;">
      ${restaurant.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
    </div>
    
    <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem;">
      ${restaurant.description}
    </p>
    
    <div style="display: flex; gap: 1rem;">
      <a href="restaurant-detail.html?id=${restaurant.id}" class="btn btn-primary" style="flex: 1;">View Full Details</a>
      <button class="btn btn-secondary favorite-btn" data-id="${restaurant.id}" style="flex: 1;">
        ${isFavorite(restaurant.id) ? '❤️ Saved' : '🤍 Save'}
      </button>
    </div>
  `;
  
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('quickViewModal').classList.remove('active');
}

function switchView(view) {
  currentView = view;
  
  const mapView = document.getElementById('mapView');
  const listView = document.getElementById('listView');
  const mapBtn = document.getElementById('mapViewBtn');
  const listBtn = document.getElementById('listViewBtn');
  
  if (view === 'map') {
    mapView.classList.remove('hidden');
    listView.classList.add('hidden');
    mapBtn.classList.remove('btn-secondary');
    mapBtn.classList.add('btn-primary');
    listBtn.classList.remove('btn-primary');
    listBtn.classList.add('btn-secondary');
    displayMapView(filteredRestaurants);
  } else {
    mapView.classList.add('hidden');
    listView.classList.remove('hidden');
    listBtn.classList.remove('btn-secondary');
    listBtn.classList.add('btn-primary');
    mapBtn.classList.remove('btn-primary');
    mapBtn.classList.add('btn-secondary');
    displayListView(filteredRestaurants);
  }
}

function updateResultCount(count) {
  document.getElementById('resultCount').textContent = count;
}

// Debounce utility
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}