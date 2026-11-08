// Collaborative Lists - Real-time Editing, Sharing, and Collaboration
// Handles list creation, sharing, permissions, and real-time updates

class CollaborativeListsManager {
    constructor() {
        this.lists = this.loadLists();
        this.currentList = null;
        this.collaborators = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderLists();
        this.setupRealTimeSync();
    }

    setupEventListeners() {
        // Create list button
        const createBtn = document.getElementById('createListBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateListModal());
        }

        // List tabs
        const tabButtons = document.querySelectorAll('.list-tab');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Search lists
        const searchInput = document.getElementById('listSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchLists(e.target.value);
            });
        }

        // Sort dropdown
        const sortSelect = document.getElementById('listSort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortLists(e.target.value);
            });
        }
    }

    openCreateListModal() {
        let modal = document.getElementById('createListModal');
        
        if (!modal) {
            modal = this.createListModal();
            document.body.appendChild(modal);
        }
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    createListModal() {
        const modal = document.createElement('div');
        modal.id = 'createListModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content create-list-modal">
                <div class="modal-header">
                    <h2>Create New List</h2>
                    <button class="close-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="createListForm" class="modal-body">
                    <div class="form-group">
                        <label for="listName">List Name *</label>
                        <input type="text" id="listName" name="listName" required 
                               placeholder="e.g., Date Night Spots">
                    </div>
                    
                    <div class="form-group">
                        <label for="listDescription">Description</label>
                        <textarea id="listDescription" name="listDescription" rows="3"
                                  placeholder="What's this list about?"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="listCategory">Category</label>
                        <select id="listCategory" name="listCategory">
                            <option value="restaurants">Restaurants</option>
                            <option value="bars">Bars & Lounges</option>
                            <option value="nightlife">Nightlife</option>
                            <option value="events">Events</option>
                            <option value="mixed">Mixed</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Privacy</label>
                        <div class="privacy-options">
                            <label class="privacy-option">
                                <input type="radio" name="privacy" value="private" checked>
                                <div class="option-content">
                                    <i class="fas fa-lock"></i>
                                    <div>
                                        <strong>Private</strong>
                                        <span>Only you can see this list</span>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="privacy-option">
                                <input type="radio" name="privacy" value="friends">
                                <div class="option-content">
                                    <i class="fas fa-user-friends"></i>
                                    <div>
                                        <strong>Friends</strong>
                                        <span>Visible to your friends</span>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="privacy-option">
                                <input type="radio" name="privacy" value="public">
                                <div class="option-content">
                                    <i class="fas fa-globe"></i>
                                    <div>
                                        <strong>Public</strong>
                                        <span>Anyone can view this list</span>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="collaborative" id="collaborativeCheckbox">
                            <span>Allow friends to add venues</span>
                        </label>
                    </div>
                </form>
                
                <div class="modal-footer">
                    <button type="button" class="btn-secondary close-modal">Cancel</button>
                    <button type="submit" form="createListForm" class="btn-primary">Create List</button>
                </div>
            </div>
        `;
        
        // Close button handlers
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        
        // Form submit
        const form = modal.querySelector('#createListForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createList(new FormData(form));
        });
        
        return modal;
    }

    createList(formData) {
        const newList = {
            id: Date.now(),
            name: formData.get('listName'),
            description: formData.get('listDescription'),
            category: formData.get('listCategory'),
            privacy: formData.get('privacy'),
            collaborative: formData.get('collaborative') === 'on',
            owner: {
                id: 'currentUser',
                name: 'You',
                avatar: 'https://i.pravatar.cc/150?img=1'
            },
            collaborators: [],
            venues: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            saves: 0,
            views: 0
        };

        this.lists.unshift(newList);
        this.saveLists();
        this.renderLists();
        
        // Close modal
        const modal = document.getElementById('createListModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        this.showNotification('List created successfully!', 'success');
        
        // Open the new list
        this.openList(newList.id);
    }

    renderLists() {
        const container = document.getElementById('listsContainer');
        if (!container) return;

        if (this.lists.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-list"></i>
                    <h3>No lists yet</h3>
                    <p>Create your first list to start organizing your favorite venues</p>
                    <button class="btn-primary" onclick="collaborativeLists.openCreateListModal()">
                        <i class="fas fa-plus"></i> Create List
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.lists.map(list => this.renderListCard(list)).join('');
        this.attachListCardListeners();
    }

    renderListCard(list) {
        const venueCount = list.venues.length;
        const collaboratorCount = list.collaborators.length;
        const isOwner = list.owner.id === 'currentUser';
        
        return `
            <div class="list-card" data-list-id="${list.id}">
                <div class="list-header">
                    <div class="list-info">
                        <h3>${list.name}</h3>
                        <div class="list-meta">
                            <span class="privacy-badge">
                                <i class="fas fa-${this.getPrivacyIcon(list.privacy)}"></i>
                                ${list.privacy}
                            </span>
                            ${list.collaborative ? '<span class="collab-badge"><i class="fas fa-users"></i> Collaborative</span>' : ''}
                        </div>
                    </div>
                    
                    <div class="list-actions-menu">
                        <button class="menu-btn" onclick="collaborativeLists.toggleListMenu(${list.id})">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="list-menu" id="listMenu${list.id}">
                            ${isOwner ? `
                                <button onclick="collaborativeLists.editList(${list.id})">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button onclick="collaborativeLists.shareList(${list.id})">
                                    <i class="fas fa-share"></i> Share
                                </button>
                                <button onclick="collaborativeLists.deleteList(${list.id})" class="danger">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            ` : `
                                <button onclick="collaborativeLists.leaveList(${list.id})" class="danger">
                                    <i class="fas fa-sign-out-alt"></i> Leave List
                                </button>
                            `}
                        </div>
                    </div>
                </div>
                
                ${list.description ? `<p class="list-description">${list.description}</p>` : ''}
                
                <div class="list-stats">
                    <div class="stat">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${venueCount} venue${venueCount !== 1 ? 's' : ''}</span>
                    </div>
                    ${collaboratorCount > 0 ? `
                        <div class="stat">
                            <i class="fas fa-users"></i>
                            <span>${collaboratorCount} collaborator${collaboratorCount !== 1 ? 's' : ''}</span>
                        </div>
                    ` : ''}
                    <div class="stat">
                        <i class="fas fa-heart"></i>
                        <span>${list.saves} saves</span>
                    </div>
                </div>
                
                ${list.venues.length > 0 ? `
                    <div class="list-preview">
                        ${list.venues.slice(0, 3).map(venue => `
                            <img src="${venue.image}" alt="${venue.name}" title="${venue.name}">
                        `).join('')}
                        ${list.venues.length > 3 ? `<span class="more-count">+${list.venues.length - 3}</span>` : ''}
                    </div>
                ` : ''}
                
                <div class="list-footer">
                    <div class="collaborators-preview">
                        <img src="${list.owner.avatar}" alt="${list.owner.name}" title="${list.owner.name}">
                        ${list.collaborators.slice(0, 3).map(c => `
                            <img src="${c.avatar}" alt="${c.name}" title="${c.name}">
                        `).join('')}
                    </div>
                    
                    <button class="btn-primary" onclick="collaborativeLists.openList(${list.id})">
                        View List
                    </button>
                </div>
            </div>
        `;
    }

    attachListCardListeners() {
        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.list-actions-menu')) {
                document.querySelectorAll('.list-menu').forEach(menu => {
                    menu.classList.remove('active');
                });
            }
        });
    }

    getPrivacyIcon(privacy) {
        const icons = {
            'private': 'lock',
            'friends': 'user-friends',
            'public': 'globe'
        };
        return icons[privacy] || 'lock';
    }

    toggleListMenu(listId) {
        const menu = document.getElementById(`listMenu${listId}`);
        if (menu) {
            // Close other menus
            document.querySelectorAll('.list-menu').forEach(m => {
                if (m !== menu) m.classList.remove('active');
            });
            
            menu.classList.toggle('active');
        }
    }

    openList(listId) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        this.currentList = list;
        
        // Navigate to list detail page
        window.location.href = `list-detail.html?id=${listId}`;
    }

    editList(listId) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        // Open edit modal (similar to create modal but pre-filled)
        this.showNotification('Edit functionality coming soon!', 'info');
    }

    shareList(listId) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        // Create share modal
        const shareUrl = `${window.location.origin}/list-detail.html?id=${listId}`;
        
        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            this.showNotification('Share link copied to clipboard!', 'success');
        }).catch(() => {
            this.showNotification('Failed to copy link', 'error');
        });
    }

    deleteList(listId) {
        if (!confirm('Are you sure you want to delete this list? This action cannot be undone.')) {
            return;
        }
        
        this.lists = this.lists.filter(l => l.id !== listId);
        this.saveLists();
        this.renderLists();
        this.showNotification('List deleted', 'success');
    }

    leaveList(listId) {
        if (!confirm('Are you sure you want to leave this list?')) {
            return;
        }
        
        // Remove user from collaborators
        const list = this.lists.find(l => l.id === listId);
        if (list) {
            list.collaborators = list.collaborators.filter(c => c.id !== 'currentUser');
            this.saveLists();
            this.renderLists();
            this.showNotification('Left list', 'success');
        }
    }

    addVenueToList(listId, venue) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        // Check if venue already in list
        if (list.venues.some(v => v.id === venue.id)) {
            this.showNotification('Venue already in list', 'info');
            return;
        }
        
        list.venues.push(venue);
        list.updatedAt = new Date().toISOString();
        
        this.saveLists();
        this.renderLists();
        this.showNotification('Venue added to list!', 'success');
        
        // Notify collaborators (in real app)
        this.notifyCollaborators(list, 'venue_added', venue);
    }

    removeVenueFromList(listId, venueId) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        list.venues = list.venues.filter(v => v.id !== venueId);
        list.updatedAt = new Date().toISOString();
        
        this.saveLists();
        this.renderLists();
        this.showNotification('Venue removed from list', 'success');
    }

    addCollaborator(listId, user) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        // Check if already a collaborator
        if (list.collaborators.some(c => c.id === user.id)) {
            this.showNotification('User is already a collaborator', 'info');
            return;
        }
        
        list.collaborators.push(user);
        list.updatedAt = new Date().toISOString();
        
        this.saveLists();
        this.renderLists();
        this.showNotification(`${user.name} added as collaborator!`, 'success');
    }

    removeCollaborator(listId, userId) {
        const list = this.lists.find(l => l.id === listId);
        if (!list) return;
        
        list.collaborators = list.collaborators.filter(c => c.id !== userId);
        list.updatedAt = new Date().toISOString();
        
        this.saveLists();
        this.renderLists();
        this.showNotification('Collaborator removed', 'success');
    }

    switchTab(tab) {
        // Update active tab button
        document.querySelectorAll('.list-tab').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            }
        });
        
        // Filter lists based on tab
        let filteredLists;
        switch(tab) {
            case 'my-lists':
                filteredLists = this.lists.filter(l => l.owner.id === 'currentUser');
                break;
            case 'shared':
                filteredLists = this.lists.filter(l => 
                    l.collaborators.some(c => c.id === 'currentUser')
                );
                break;
            case 'saved':
                // Lists saved by user (would come from API)
                filteredLists = [];
                break;
            default:
                filteredLists = this.lists;
        }
        
        // Render filtered lists
        const container = document.getElementById('listsContainer');
        if (container) {
            if (filteredLists.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-list"></i>
                        <h3>No lists found</h3>
                        <p>No lists in this category yet</p>
                    </div>
                `;
            } else {
                container.innerHTML = filteredLists.map(list => this.renderListCard(list)).join('');
                this.attachListCardListeners();
            }
        }
    }

    searchLists(query) {
        if (!query || query.trim().length === 0) {
            this.renderLists();
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        const filtered = this.lists.filter(list => 
            list.name.toLowerCase().includes(lowerQuery) ||
            (list.description && list.description.toLowerCase().includes(lowerQuery)) ||
            list.venues.some(v => v.name.toLowerCase().includes(lowerQuery))
        );
        
        const container = document.getElementById('listsContainer');
        if (container) {
            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <h3>No results found</h3>
                        <p>Try a different search term</p>
                    </div>
                `;
            } else {
                container.innerHTML = filtered.map(list => this.renderListCard(list)).join('');
                this.attachListCardListeners();
            }
        }
    }

    sortLists(sortBy) {
        switch(sortBy) {
            case 'name':
                this.lists.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'updated':
                this.lists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                break;
            case 'created':
                this.lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'venues':
                this.lists.sort((a, b) => b.venues.length - a.venues.length);
                break;
            case 'saves':
                this.lists.sort((a, b) => b.saves - a.saves);
                break;
        }
        
        this.renderLists();
    }

    setupRealTimeSync() {
        // In a real app, this would set up WebSocket connection
        // For now, simulate with periodic checks
        setInterval(() => {
            this.checkForUpdates();
        }, 30000); // Check every 30 seconds
    }

    checkForUpdates() {
        // In a real app, check server for updates
        // For demo, just log
        console.log('Checking for list updates...');
    }

    notifyCollaborators(list, action, data) {
        // In a real app, send notifications to collaborators
        console.log('Notifying collaborators:', list.collaborators, action, data);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    loadLists() {
        const stored = localStorage.getItem('collaborativeLists');
        if (stored) {
            return JSON.parse(stored);
        }
        
        // Return sample lists for demo
        return [
            {
                id: 1,
                name: 'Date Night Favorites',
                description: 'Romantic spots perfect for special evenings',
                category: 'restaurants',
                privacy: 'private',
                collaborative: false,
                owner: {
                    id: 'currentUser',
                    name: 'You',
                    avatar: 'https://i.pravatar.cc/150?img=1'
                },
                collaborators: [],
                venues: [
                    {
                        id: 1,
                        name: 'Trattoria Toscana',
                        image: '/assets/img/placeholder-venue.svg'
                    },
                    {
                        id: 2,
                        name: 'Le Bistro',
                        image: '/assets/img/placeholder-venue.svg'
                    }
                ],
                createdAt: '2024-11-15T10:00:00Z',
                updatedAt: '2024-11-20T14:30:00Z',
                saves: 12,
                views: 45
            },
            {
                id: 2,
                name: 'Weekend Brunch Spots',
                description: 'Best places for lazy Sunday brunch',
                category: 'restaurants',
                privacy: 'friends',
                collaborative: true,
                owner: {
                    id: 'currentUser',
                    name: 'You',
                    avatar: 'https://i.pravatar.cc/150?img=1'
                },
                collaborators: [
                    {
                        id: 'user2',
                        name: 'Sarah Chen',
                        avatar: 'https://i.pravatar.cc/150?img=2'
                    },
                    {
                        id: 'user3',
                        name: 'Mike Johnson',
                        avatar: 'https://i.pravatar.cc/150?img=3'
                    }
                ],
                venues: [
                    {
                        id: 3,
                        name: 'The Breakfast Club',
                        image: '/assets/img/placeholder-venue.svg'
                    }
                ],
                createdAt: '2024-11-10T09:00:00Z',
                updatedAt: '2024-11-21T11:15:00Z',
                saves: 8,
                views: 32
            }
        ];
    }

    saveLists() {
        localStorage.setItem('collaborativeLists', JSON.stringify(this.lists));
    }
}

// Initialize when DOM is ready
let collaborativeLists;
document.addEventListener('DOMContentLoaded', () => {
    collaborativeLists = new CollaborativeListsManager();
});