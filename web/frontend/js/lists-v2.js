// SceneLink - My Lists JavaScript

let allLists = [];
let filteredLists = [];
let currentFilter = 'all';
let selectedIcon = '📍';

// Sample lists data
const sampleLists = [
    {
        id: 1,
        name: "Date Night Favorites",
        description: "Romantic spots perfect for special occasions",
        icon: "❤️",
        privacy: "private",
        itemCount: 8,
        sharedWith: 0,
        created: "2024-11-01",
        updated: "2024-11-14",
        items: [
            { name: "Mamma Maria", image: "/assets/img/placeholder-venue.svg" },
            { name: "Bistro du Midi", image: "/assets/img/placeholder-venue.svg" },
            { name: "Yvonne's", image: "/assets/img/placeholder-venue.svg" }
        ]
    },
    {
        id: 2,
        name: "Best Cocktail Bars",
        description: "My go-to spots for craft cocktails",
        icon: "🍸",
        privacy: "shared",
        itemCount: 6,
        sharedWith: 3,
        created: "2024-10-15",
        updated: "2024-11-13",
        items: [
            { name: "Drink", image: "/assets/img/placeholder-venue.svg" },
            { name: "Capo", image: "/assets/img/placeholder-venue.svg" }
        ]
    },
    {
        id: 3,
        name: "Weekend Brunch Spots",
        description: "Best brunch places in Boston",
        icon: "🥞",
        privacy: "collaborative",
        itemCount: 10,
        sharedWith: 5,
        created: "2024-09-20",
        updated: "2024-11-12",
        items: [
            { name: "Myers + Chang", image: "/assets/img/placeholder-venue.svg" }
        ]
    },
    {
        id: 4,
        name: "Live Music Venues",
        description: "Places with great live entertainment",
        icon: "🎵",
        privacy: "private",
        itemCount: 5,
        sharedWith: 0,
        created: "2024-11-05",
        updated: "2024-11-10",
        items: [
            { name: "The Beehive", image: "/assets/img/placeholder-venue.svg" }
        ]
    }
];

// Friends data for sharing
const friends = [
    { name: "Sarah Chen", username: "@sarahchen", avatar: "SC" },
    { name: "Mike Johnson", username: "@mikej", avatar: "MJ" },
    { name: "Emma Davis", username: "@emmad", avatar: "ED" },
    { name: "Tom Wilson", username: "@tomw", avatar: "TW" }
];

// Available icons
const availableIcons = [
    '📍', '❤️', '⭐', '🍕', '🍔', '🍣', '🍝', '🍷',
    '🍸', '🍺', '☕', '🎵', '🎉', '🎭', '🏖️', '🌃',
    '🍰', '🥗', '🌮', '🍜', '🥘', '🍱', '🥞', '🧁'
];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadLists();
    updateStats();
    initEventListeners();
});

function loadLists() {
    // Load from localStorage or use sample data
    const stored = storage.get('scenelink_lists');
    allLists = stored || sampleLists;
    filteredLists = [...allLists];
    renderLists();
}

function renderLists() {
    const grid = document.getElementById('listsGrid');
    grid.innerHTML = '';
    
    if (filteredLists.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.3;">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <h3>No Lists Found</h3>
                <p>Create your first list to get started</p>
                <button class="btn-primary" onclick="document.getElementById('createListBtn').click()" style="margin-top: 20px;">Create List</button>
            </div>
        `;
        return;
    }
    
    filteredLists.forEach(list => {
        const card = createListCard(list);
        grid.appendChild(card);
    });
}

function createListCard(list) {
    const card = document.createElement('div');
    card.className = 'list-card';
    
    const privacyIcons = {
        private: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        shared: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>',
        collaborative: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path></svg>'
    };
    
    const previewHTML = list.items.slice(0, 3).map(item => 
        `<div class="list-preview-item"><img src="${item.image}" alt="${item.name}"></div>`
    ).join('');
    
    const moreCount = list.itemCount - 3;
    
    card.innerHTML = `
        <div class="list-card-header" style="position: relative;">
            <div class="list-icon-large">${list.icon}</div>
            <h3 class="list-title">${list.name}</h3>
            <p class="list-description">${list.description}</p>
            <div class="list-privacy-badge">
                ${privacyIcons[list.privacy]}
                <span>${list.privacy}</span>
            </div>
        </div>
        
        <div class="list-card-body">
            <div class="list-stats">
                <div class="list-stat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>${list.itemCount} places</span>
                </div>
                ${list.sharedWith > 0 ? `
                <div class="list-stat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                    </svg>
                    <span>${list.sharedWith} friends</span>
                </div>
                ` : ''}
            </div>
            
            <div class="list-preview">
                ${previewHTML}
                ${moreCount > 0 ? `<div class="list-preview-more">+${moreCount}</div>` : ''}
            </div>
        </div>
        
        <div class="list-card-footer">
            <button class="list-action-btn" onclick="event.stopPropagation(); openShareModal(${list.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                Share
            </button>
            <button class="list-action-btn" onclick="event.stopPropagation(); editList(${list.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit
            </button>
        </div>
    `;
    
    card.onclick = () => viewList(list.id);
    
    return card;
}

function updateStats() {
    const totalSaved = allLists.reduce((sum, list) => sum + list.itemCount, 0);
    const totalShared = allLists.reduce((sum, list) => sum + list.sharedWith, 0);
    
    document.getElementById('totalSaved').textContent = totalSaved;
    document.getElementById('totalLists').textContent = allLists.length;
    document.getElementById('sharedWith').textContent = totalShared;
    document.getElementById('recentActivity').textContent = allLists.filter(l => {
        const updated = new Date(l.updated);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return updated > weekAgo;
    }).length;
}

function initEventListeners() {
    // Create list button
    document.getElementById('createListBtn').addEventListener('click', openCreateListModal);
    
    // Search
    document.getElementById('searchLists').addEventListener('input', debounce(applyListFilters, 300));
    
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            applyListFilters();
        });
    });
    
    // Sort
    document.getElementById('sortLists').addEventListener('change', applySorting);
    
    // Modal close
    document.getElementById('closeListModal').addEventListener('click', closeListModal);
    document.getElementById('closeShareModal')?.addEventListener('click', closeShareModal);
    
    // Form submit
    document.getElementById('listForm').addEventListener('submit', handleCreateList);
    document.getElementById('cancelListBtn').addEventListener('click', closeListModal);
}

function openCreateListModal() {
    const modal = document.getElementById('listModal');
    document.getElementById('modalTitle').textContent = 'Create New List';
    document.getElementById('listForm').reset();
    renderIconPicker();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeListModal() {
    document.getElementById('listModal').classList.remove('active');
    document.body.style.overflow = '';
}

function renderIconPicker() {
    const picker = document.getElementById('iconPicker');
    picker.innerHTML = '';
    
    availableIcons.forEach(icon => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'icon-option';
        option.textContent = icon;
        option.onclick = () => {
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedIcon = icon;
        };
        
        if (icon === selectedIcon) {
            option.classList.add('selected');
        }
        
        picker.appendChild(option);
    });
}

function handleCreateList(e) {
    e.preventDefault();
    
    const name = document.getElementById('listName').value;
    const description = document.getElementById('listDescription').value;
    const privacy = document.querySelector('input[name="privacy"]:checked').value;
    
    const newList = {
        id: Date.now(),
        name: name,
        description: description,
        icon: selectedIcon,
        privacy: privacy,
        itemCount: 0,
        sharedWith: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        items: []
    };
    
    allLists.unshift(newList);
    storage.set('scenelink_lists', allLists);
    
    closeListModal();
    loadLists();
    updateStats();
    
    notify.success('List Created!', `"${name}" has been created successfully`);
}

function applyListFilters() {
    let filtered = [...allLists];
    
    // Search
    const searchTerm = document.getElementById('searchLists').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(list =>
            list.name.toLowerCase().includes(searchTerm) ||
            list.description.toLowerCase().includes(searchTerm)
        );
    }
    
    // Privacy filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(list => list.privacy === currentFilter);
    }
    
    filteredLists = filtered;
    renderLists();
}

function applySorting() {
    const sortBy = document.getElementById('sortLists').value;
    
    switch(sortBy) {
        case 'name':
            filteredLists.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'items':
            filteredLists.sort((a, b) => b.itemCount - a.itemCount);
            break;
        case 'created':
            filteredLists.sort((a, b) => new Date(b.created) - new Date(a.created));
            break;
        default: // recent
            filteredLists.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    }
    
    renderLists();
}

function openShareModal(listId) {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    
    // Render friends list
    const friendsList = document.getElementById('friendsList');
    friendsList.innerHTML = '';
    
    friends.forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div class="friend-avatar">${friend.avatar}</div>
            <div class="friend-info">
                <div class="friend-name">${friend.name}</div>
                <div class="friend-username">${friend.username}</div>
            </div>
            <input type="checkbox" class="friend-checkbox">
        `;
        friendsList.appendChild(item);
    });
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function editList(listId) {
    const list = allLists.find(l => l.id === listId);
    if (!list) return;
    
    document.getElementById('modalTitle').textContent = 'Edit List';
    document.getElementById('listName').value = list.name;
    document.getElementById('listDescription').value = list.description;
    selectedIcon = list.icon;
    document.querySelector(`input[name="privacy"][value="${list.privacy}"]`).checked = true;
    
    renderIconPicker();
    document.getElementById('listModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function viewList(listId) {
    notify.info('Opening List', 'List details view coming soon');
}