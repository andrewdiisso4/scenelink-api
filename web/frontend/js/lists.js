// Lists page JavaScript

let selectedIcon = '📋';

document.addEventListener('DOMContentLoaded', async () => {
  await loadRestaurants();
  displayLists();
  setupEventListeners();
});

function setupEventListeners() {
  // Create list button
  document.getElementById('createListBtn').addEventListener('click', showCreateListModal);
  document.getElementById('closeCreateModal').addEventListener('click', closeCreateListModal);
  document.getElementById('saveListBtn').addEventListener('click', handleCreateList);
  
  // List detail modal
  document.getElementById('closeDetailModal').addEventListener('click', closeListDetailModal);
  
  // Modal backdrop clicks
  document.getElementById('createListModal').addEventListener('click', (e) => {
    if (e.target.id === 'createListModal') closeCreateListModal();
  });
  document.getElementById('listDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'listDetailModal') closeListDetailModal();
  });
  
  // Icon selection
  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.icon-btn').forEach(b => {
        b.style.background = 'var(--dark-lighter)';
        b.style.border = '2px solid transparent';
      });
      btn.style.background = 'rgba(212, 175, 55, 0.2)';
      btn.style.border = '2px solid var(--gold-primary)';
      selectedIcon = btn.dataset.icon;
    });
  });
  
  // Style icon buttons
  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.style.cssText = `
      padding: 0.75rem;
      background: var(--dark-lighter);
      border: 2px solid transparent;
      border-radius: var(--radius-md);
      font-size: 1.5rem;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      if (btn.dataset.icon !== selectedIcon) {
        btn.style.background = 'rgba(212, 175, 55, 0.1)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (btn.dataset.icon !== selectedIcon) {
        btn.style.background = 'var(--dark-lighter)';
      }
    });
  });
}

function displayLists() {
  const container = document.getElementById('listsContainer');
  
  if (SceneLink.lists.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 2rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">📋</div>
        <h3 style="color: var(--text-secondary); margin-bottom: 0.5rem;">No lists yet</h3>
        <p style="color: var(--text-muted); margin-bottom: 2rem;">Create your first list to organize your favorite restaurants</p>
        <button onclick="document.getElementById('createListBtn').click()" class="btn btn-primary">
          <span>➕</span>
          <span>Create Your First List</span>
        </button>
      </div>
    `;
    return;
  }
  
  const html = SceneLink.lists.map(list => `
    <div class="list-item" data-list-id="${list.id}" style="cursor: pointer;">
      <div class="list-info">
        <div class="list-icon">${list.icon}</div>
        <div>
          <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${list.name}</div>
          <div style="color: var(--text-muted); font-size: 0.9rem;">${list.count} restaurant${list.count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <span class="list-count">${list.count}</span>
        <button class="delete-list-btn" data-list-id="${list.id}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.5rem; font-size: 1.2rem; transition: color 0.3s ease;" title="Delete list">
          🗑️
        </button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // Add click handlers
  container.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.delete-list-btn')) {
        const listId = parseInt(item.dataset.listId);
        showListDetail(listId);
      }
    });
  });
  
  // Add delete handlers
  container.querySelectorAll('.delete-list-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const listId = parseInt(btn.dataset.listId);
      handleDeleteList(listId);
    });
  });
}

function showCreateListModal() {
  document.getElementById('createListModal').classList.add('active');
  document.getElementById('listNameInput').value = '';
  selectedIcon = '📋';
  
  // Reset icon selection
  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.style.background = 'var(--dark-lighter)';
    btn.style.border = '2px solid transparent';
  });
}

function closeCreateListModal() {
  document.getElementById('createListModal').classList.remove('active');
}

function handleCreateList() {
  const name = document.getElementById('listNameInput').value.trim();
  
  if (!name) {
    showNotification('Please enter a list name', 'error');
    return;
  }
  
  createList(name, selectedIcon);
  displayLists();
  closeCreateListModal();
  showNotification(`Created list "${name}"!`);
}

function handleDeleteList(listId) {
  const list = SceneLink.lists.find(l => l.id === listId);
  if (!list) return;
  
  if (confirm(`Are you sure you want to delete "${list.name}"?`)) {
    const index = SceneLink.lists.findIndex(l => l.id === listId);
    if (index > -1) {
      SceneLink.lists.splice(index, 1);
      displayLists();
      showNotification(`Deleted "${list.name}"`);
    }
  }
}

function showListDetail(listId) {
  const list = SceneLink.lists.find(l => l.id === listId);
  if (!list) return;
  
  document.getElementById('listDetailIcon').textContent = list.icon;
  document.getElementById('listDetailName').textContent = list.name;
  
  const restaurants = SceneLink.restaurants.filter(r => list.restaurants.includes(r.id));
  const container = document.getElementById('listDetailRestaurants');
  const emptyMessage = document.getElementById('emptyListMessage');
  
  if (restaurants.length === 0) {
    container.classList.add('hidden');
    emptyMessage.classList.remove('hidden');
  } else {
    container.classList.remove('hidden');
    emptyMessage.classList.add('hidden');
    
    container.innerHTML = restaurants.map(r => {
      const card = createRestaurantCard(r);
      // Add remove button to each card
      return card.replace('</div>\n    </div>', `
        <button class="remove-from-list-btn" data-restaurant-id="${r.id}" data-list-id="${listId}" style="width: 100%; margin-top: 1rem; padding: 0.5rem; background: var(--dark-lighter); color: var(--text-muted); border: 1px solid rgba(212, 175, 55, 0.1); border-radius: var(--radius-md); cursor: pointer; transition: all 0.3s ease;">
          Remove from List
        </button>
      </div>
    </div>`);
    }).join('');
    
    // Add remove handlers
    container.querySelectorAll('.remove-from-list-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const restaurantId = parseInt(btn.dataset.restaurantId);
        const listId = parseInt(btn.dataset.listId);
        removeFromList(listId, restaurantId);
        showListDetail(listId);
        displayLists();
        showNotification('Removed from list');
      });
      
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--error)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--error)';
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'var(--dark-lighter)';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'rgba(212, 175, 55, 0.1)';
      });
    });
  }
  
  document.getElementById('listDetailModal').classList.add('active');
}

function closeListDetailModal() {
  document.getElementById('listDetailModal').classList.remove('active');
}