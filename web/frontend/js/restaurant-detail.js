// Restaurant detail page JavaScript

let currentRestaurant = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadRestaurants();
  
  // Get restaurant ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const restaurantId = parseInt(urlParams.get('id'));
  
  if (restaurantId) {
    currentRestaurant = getRestaurantById(restaurantId);
    if (currentRestaurant) {
      displayRestaurantDetails(currentRestaurant);
      displaySimilarRestaurants(currentRestaurant);
    } else {
      window.location.href = 'explore.html';
    }
  } else {
    window.location.href = 'explore.html';
  }
  
  setupEventListeners();
});

function setupEventListeners() {
  // Favorite button
  document.getElementById('favoriteBtn').addEventListener('click', handleFavoriteClick);
  
  // Add to list button
  document.getElementById('addToListBtn').addEventListener('click', showAddToListModal);
  document.getElementById('closeListModal').addEventListener('click', closeAddToListModal);
  document.getElementById('addToListModal').addEventListener('click', (e) => {
    if (e.target.id === 'addToListModal') closeAddToListModal();
  });
  
  // Create new list
  document.getElementById('createNewListBtn').addEventListener('click', handleCreateNewList);
}

function displayRestaurantDetails(restaurant) {
  // Hero section
  document.getElementById('restaurantHeroImage').src = restaurant.image;
  document.getElementById('restaurantHeroImage').alt = restaurant.name;
  document.getElementById('restaurantName').textContent = restaurant.name;
  document.getElementById('restaurantSubtitle').textContent = `${restaurant.cuisine} • ${restaurant.location}`;
  
  // Quick info
  document.getElementById('restaurantRating').innerHTML = `
    ${generateStars(restaurant.rating)}
    <span class="rating-text">${restaurant.rating} (${restaurant.reviewCount} reviews)</span>
  `;
  document.getElementById('restaurantPrice').textContent = restaurant.priceLevel;
  document.getElementById('restaurantCrowd').textContent = restaurant.crowd;
  document.getElementById('restaurantHours').textContent = restaurant.hours;
  
  // Tags
  document.getElementById('restaurantTags').innerHTML = restaurant.tags
    .map(tag => `<span class="tag">${tag}</span>`)
    .join('');
  
  // Description
  document.getElementById('restaurantDescription').textContent = restaurant.description;
  
  // Menu
  const menuHtml = `
    <div style="display: grid; gap: 1.5rem;">
      ${restaurant.menu.appetizers ? `
        <div>
          <h3 style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 0.75rem;">Appetizers</h3>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
            ${restaurant.menu.appetizers.map(item => `
              <li style="color: var(--text-secondary); padding-left: 1.5rem; position: relative;">
                <span style="position: absolute; left: 0; color: var(--gold-primary);">•</span>
                ${item}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      ${restaurant.menu.entrees ? `
        <div>
          <h3 style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 0.75rem;">Entrees</h3>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
            ${restaurant.menu.entrees.map(item => `
              <li style="color: var(--text-secondary); padding-left: 1.5rem; position: relative;">
                <span style="position: absolute; left: 0; color: var(--gold-primary);">•</span>
                ${item}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      ${restaurant.menu.desserts ? `
        <div>
          <h3 style="color: var(--text-primary); font-size: 1.1rem; margin-bottom: 0.75rem;">Desserts</h3>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
            ${restaurant.menu.desserts.map(item => `
              <li style="color: var(--text-secondary); padding-left: 1.5rem; position: relative;">
                <span style="position: absolute; left: 0; color: var(--gold-primary);">•</span>
                ${item}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
  document.getElementById('restaurantMenu').innerHTML = menuHtml;
  
  // Features
  document.getElementById('restaurantFeatures').innerHTML = restaurant.features
    .map(feature => `<span class="tag">${feature}</span>`)
    .join('');
  
  // Contact info
  document.getElementById('restaurantAddress').textContent = restaurant.address;
  document.getElementById('restaurantPhone').textContent = restaurant.phone;
  document.getElementById('restaurantPhone').href = `tel:${restaurant.phone}`;
  document.getElementById('restaurantWebsite').href = restaurant.website;
  
  // Directions button
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`;
  document.getElementById('directionsBtn').href = directionsUrl;
  
  // Update favorite button
  updateFavoriteButton();
  
  // Display reviews
  displayReviews(restaurant);
}

function displayReviews(restaurant) {
  const reviews = [
    {
      author: "Sarah M.",
      avatar: "/assets/img/placeholder-avatar.svg",
      rating: 5,
      date: "2 days ago",
      text: "Absolutely amazing experience! The food was incredible and the service was top-notch. Highly recommend the chef's special."
    },
    {
      author: "Michael R.",
      avatar: "/assets/img/placeholder-avatar.svg",
      rating: 4,
      date: "1 week ago",
      text: "Great atmosphere and delicious food. The portions were generous and the prices were reasonable. Will definitely come back!"
    },
    {
      author: "Emily K.",
      avatar: "/assets/img/placeholder-avatar.svg",
      rating: 5,
      date: "2 weeks ago",
      text: "One of the best dining experiences I've had in Boston. The attention to detail is impressive and every dish was perfectly executed."
    }
  ];
  
  const reviewsHtml = reviews.map(review => `
    <div style="padding: 1.5rem; background: var(--dark-lighter); border-radius: var(--radius-md); margin-bottom: 1rem;">
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <img src="${review.avatar}" alt="${review.author}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <div>
              <div style="font-weight: 600; margin-bottom: 0.25rem;">${review.author}</div>
              <div style="color: var(--text-muted); font-size: 0.85rem;">${review.date}</div>
            </div>
            <div class="rating">
              ${generateStars(review.rating)}
            </div>
          </div>
        </div>
      </div>
      <p style="color: var(--text-secondary); line-height: 1.6; margin: 0;">${review.text}</p>
    </div>
  `).join('');
  
  document.getElementById('reviewsList').innerHTML = reviewsHtml;
}

function displaySimilarRestaurants(restaurant) {
  // Find similar restaurants (same cuisine or neighborhood)
  const similar = SceneLink.restaurants
    .filter(r => r.id !== restaurant.id && (r.cuisine === restaurant.cuisine || r.neighborhood === restaurant.neighborhood))
    .slice(0, 3);
  
  const html = similar.map(r => `
    <a href="restaurant-detail.html?id=${r.id}" style="display: flex; gap: 1rem; padding: 1rem; background: var(--dark-lighter); border-radius: var(--radius-md); margin-bottom: 1rem; transition: all 0.3s ease; text-decoration: none;">
      <img src="${r.image}" alt="${r.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-sm);">
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 0.25rem; color: var(--text-primary);">${r.name}</div>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">${r.cuisine}</div>
        <div class="rating" style="font-size: 0.85rem;">
          ${generateStars(r.rating)}
        </div>
      </div>
    </a>
  `).join('');
  
  document.getElementById('similarRestaurants').innerHTML = html || '<p style="color: var(--text-muted); font-size: 0.9rem;">No similar restaurants found</p>';
}

function handleFavoriteClick() {
  if (!currentRestaurant) return;
  
  const isFav = toggleFavorite(currentRestaurant.id);
  updateFavoriteButton();
  
  showNotification(
    isFav ? `Added ${currentRestaurant.name} to favorites!` : `Removed ${currentRestaurant.name} from favorites`,
    'success'
  );
}

function updateFavoriteButton() {
  if (!currentRestaurant) return;
  
  const isFav = isFavorite(currentRestaurant.id);
  const icon = document.getElementById('favoriteIcon');
  const text = document.getElementById('favoriteText');
  
  icon.textContent = isFav ? '❤️' : '🤍';
  text.textContent = isFav ? 'Remove from Favorites' : 'Add to Favorites';
}

function showAddToListModal() {
  const modal = document.getElementById('addToListModal');
  const listOptions = document.getElementById('listOptions');
  
  // Display all lists
  const html = SceneLink.lists.map(list => {
    const isInList = list.restaurants.includes(currentRestaurant.id);
    return `
      <div class="list-item" data-list-id="${list.id}" style="cursor: pointer; opacity: ${isInList ? '0.5' : '1'};">
        <div class="list-info">
          <div class="list-icon">${list.icon}</div>
          <div>
            <div style="font-weight: 600;">${list.name}</div>
            <div style="color: var(--text-muted); font-size: 0.85rem;">${list.count} restaurants</div>
          </div>
        </div>
        <div style="color: ${isInList ? 'var(--success)' : 'var(--gold-primary)'};">
          ${isInList ? '✓ Added' : '+ Add'}
        </div>
      </div>
    `;
  }).join('');
  
  listOptions.innerHTML = html;
  
  // Add click handlers
  listOptions.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', () => {
      const listId = parseInt(item.dataset.listId);
      const list = SceneLink.lists.find(l => l.id === listId);
      
      if (!list.restaurants.includes(currentRestaurant.id)) {
        addToList(listId, currentRestaurant.id);
        showNotification(`Added to ${list.name}!`);
        closeAddToListModal();
      }
    });
  });
  
  modal.classList.add('active');
}

function closeAddToListModal() {
  document.getElementById('addToListModal').classList.remove('active');
}


  function handleCreateNewList() {
    // Close the add to list modal
    closeAddToListModal();
    
    // Create a custom modal for new list creation
    const modalHtml = `
      <div id="createListModal" class="modal active">
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h2 style="margin: 0;">Create New List</h2>
            <button class="modal-close" onclick="document.getElementById('createListModal').remove()">✕</button>
          </div>
          <div class="modal-body">
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">List Name</label>
              <input type="text" id="newListName" placeholder="e.g., Date Night Spots" style="width: 100%; padding: 0.75rem; background: var(--dark-lighter); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 1rem;">
            </div>
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Choose an Icon</label>
              <div id="iconPicker" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem;">
                ${['🍽️', '🍕', '🍔', '🍣', '🍝', '🥗', '🍜', '🍱', '🌮', '🍷', '🍸', '☕', '🍰', '🎂', '🍩', '🥐', '🍞', '🥖', '💕', '⭐', '🌟', '✨', '🎉', '🎊'].map(icon => 
                  `<button class="icon-option" data-icon="${icon}" style="padding: 0.75rem; background: var(--dark-lighter); border: 2px solid transparent; border-radius: var(--radius-sm); font-size: 1.5rem; cursor: pointer; transition: all 0.2s ease;">${icon}</button>`
                ).join('')}
              </div>
            </div>
            <div style="display: flex; gap: 1rem;">
              <button onclick="document.getElementById('createListModal').remove()" class="btn btn-secondary" style="flex: 1;">Cancel</button>
              <button id="confirmCreateList" class="btn btn-primary" style="flex: 1;">Create List</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    let selectedIcon = '📋';
    
    // Icon selection
    document.querySelectorAll('.icon-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.icon-option').forEach(b => b.style.borderColor = 'transparent');
        e.target.style.borderColor = 'var(--gold-primary)';
        selectedIcon = e.target.dataset.icon;
      });
    });
    
    // Set default icon
    document.querySelector('.icon-option').style.borderColor = 'var(--gold-primary)';
    
    // Focus on input
    document.getElementById('newListName').focus();
    
    // Handle create
    document.getElementById('confirmCreateList').addEventListener('click', () => {
      const name = document.getElementById('newListName').value.trim();
      if (name) {
        const newList = createList(name, selectedIcon);
        addToList(newList.id, currentRestaurant.id);
        showNotification(`Created "${name}" and added restaurant!`, 'success');
        document.getElementById('createListModal').remove();
      } else {
        showNotification('Please enter a list name', 'error');
      }
    });
    
    // Handle enter key
    document.getElementById('newListName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('confirmCreateList').click();
      }
    });
    
    // Close on background click
    document.getElementById('createListModal').addEventListener('click', (e) => {
      if (e.target.id === 'createListModal') {
        document.getElementById('createListModal').remove();
      }
    });
  }
