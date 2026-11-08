/**
 * My Lists Page Enhanced JavaScript
 * Provides list management, collaboration, and organization features
 */

(function() {
    'use strict';

    // State management
    const state = {
        lists: [],
        activeList: null,
        activeCategory: 'all',
        userLists: JSON.parse(localStorage.getItem('userLists') || '[]'),
        sharedLists: JSON.parse(localStorage.getItem('sharedLists') || '[]'),
        listTemplates: []
    };

    // Mock lists data
    const mockLists = [
        {
            id: 'list1',
            name: 'Date Night Favorites',
            category: 'Date Night',
            description: 'Romantic spots perfect for special occasions',
            isPublic: false,
            isCollaborative: true,
            collaborators: ['Sarah', 'Mike'],
            venues: [
                {
                    id: 'v1',
                    name: 'Harbor View Restaurant',
                    type: 'Restaurant',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.9,
                    priceLevel: 4,
                    notes: 'Request table by the window',
                    addedBy: 'You',
                    addedDate: '2024-01-15'
                },
                {
                    id: 'v2',
                    name: 'Rooftop Bar & Lounge',
                    type: 'Bar',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.6,
                    priceLevel: 3,
                    notes: 'Best at sunset',
                    addedBy: 'Sarah',
                    addedDate: '2024-01-14'
                }
            ],
            createdDate: '2024-01-10',
            lastModified: '2024-01-15',
            saves: 24,
            views: 156
        },
        {
            id: 'list2',
            name: 'Want to Try',
            category: 'Want to Try',
            description: 'Places I\'ve been meaning to check out',
            isPublic: true,
            isCollaborative: false,
            collaborators: [],
            venues: [
                {
                    id: 'v3',
                    name: 'The Underground Club',
                    type: 'Nightlife',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.5,
                    priceLevel: 2,
                    notes: 'Friends recommend the DJ nights',
                    addedBy: 'You',
                    addedDate: '2024-01-12'
                },
                {
                    id: 'v4',
                    name: 'Sushi Paradise',
                    type: 'Restaurant',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.8,
                    priceLevel: 3,
                    notes: 'Try the omakase',
                    addedBy: 'You',
                    addedDate: '2024-01-11'
                },
                {
                    id: 'v5',
                    name: 'Jazz Lounge',
                    type: 'Bar',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.8,
                    priceLevel: 3,
                    notes: 'Live music on weekends',
                    addedBy: 'You',
                    addedDate: '2024-01-10'
                }
            ],
            createdDate: '2024-01-08',
            lastModified: '2024-01-12',
            saves: 12,
            views: 89
        },
        {
            id: 'list3',
            name: 'Group Hangouts',
            category: 'Groups',
            description: 'Perfect spots for hanging with the crew',
            isPublic: true,
            isCollaborative: true,
            collaborators: ['Alex', 'Chris', 'Taylor'],
            venues: [
                {
                    id: 'v6',
                    name: 'Sports Bar Central',
                    type: 'Bar',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.4,
                    priceLevel: 2,
                    notes: 'Great for game nights',
                    addedBy: 'Alex',
                    addedDate: '2024-01-13'
                },
                {
                    id: 'v7',
                    name: 'Bowling & Brews',
                    type: 'Entertainment',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.3,
                    priceLevel: 2,
                    notes: 'Book lanes in advance',
                    addedBy: 'Chris',
                    addedDate: '2024-01-12'
                }
            ],
            createdDate: '2024-01-09',
            lastModified: '2024-01-13',
            saves: 18,
            views: 124
        }
    ];

    // List templates
    const listTemplates = [
        {
            id: 'template1',
            name: 'Date Night',
            icon: 'fa-heart',
            description: 'Romantic venues for special occasions',
            suggestedCategories: ['Fine Dining', 'Cocktail Bars', 'Rooftop Venues']
        },
        {
            id: 'template2',
            name: 'Weekend Brunch',
            icon: 'fa-coffee',
            description: 'Best brunch spots in the city',
            suggestedCategories: ['Brunch', 'Cafes', 'Bakeries']
        },
        {
            id: 'template3',
            name: 'Happy Hour',
            icon: 'fa-glass-cheers',
            description: 'Great deals and good vibes',
            suggestedCategories: ['Bars', 'Pubs', 'Lounges']
        },
        {
            id: 'template4',
            name: 'Foodie Adventures',
            icon: 'fa-utensils',
            description: 'Must-try restaurants and cuisines',
            suggestedCategories: ['Restaurants', 'Food Trucks', 'Markets']
        }
    ];

    // Initialize
    function init() {
        state.lists = mockLists;
        state.listTemplates = listTemplates;
        
        renderListsGrid();
        renderTemplates();
        setupEventListeners();
        setupScrollAnimations();
    }

    // Render lists grid
    function renderListsGrid() {
        const listsContainer = document.getElementById('listsGrid');
        if (!listsContainer) return;

        let filteredLists = state.lists;
        
        if (state.activeCategory !== 'all') {
            filteredLists = state.lists.filter(list => list.category === state.activeCategory);
        }

        if (filteredLists.length === 0) {
            listsContainer.innerHTML = `
                <div class="no-lists">
                    <i class="fas fa-list"></i>
                    <h3>No Lists Yet</h3>
                    <p>Create your first list to start organizing your favorite venues.</p>
                    <button class="btn-primary" onclick="window.listsPageEnhanced.showCreateListModal()">
                        <i class="fas fa-plus"></i>
                        Create Your First List
                    </button>
                </div>
            `;
            return;
        }

        listsContainer.innerHTML = filteredLists.map(list => createListCard(list)).join('');
        attachListCardListeners();
        updateListsCount(filteredLists.length);
    }

    // Create list card HTML
    function createListCard(list) {
        const previewImages = list.venues.slice(0, 3).map(v => v.image);
        
        return `
            <div class="list-card" data-list-id="${list.id}">
                <div class="list-preview-images">
                    ${previewImages.length > 0 ? `
                        <div class="preview-grid">
                            ${previewImages.map((img, idx) => `
                                <div class="preview-image ${previewImages.length === 1 ? 'single' : ''}">
                                    <img src="${img}" alt="Venue ${idx + 1}">
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-preview">
                            <i class="fas fa-image"></i>
                            <span>No venues yet</span>
                        </div>
                    `}
                    <div class="list-badges">
                        ${list.isCollaborative ? '<span class="badge-collaborative"><i class="fas fa-users"></i></span>' : ''}
                        ${list.isPublic ? '<span class="badge-public"><i class="fas fa-globe"></i></span>' : '<span class="badge-private"><i class="fas fa-lock"></i></span>'}
                    </div>
                </div>
                <div class="list-content">
                    <div class="list-header">
                        <h3 class="list-name">${list.name}</h3>
                        <div class="list-category-badge">${list.category}</div>
                    </div>
                    <p class="list-description">${list.description}</p>
                    <div class="list-stats">
                        <span class="stat-item">
                            <i class="fas fa-map-marker-alt"></i>
                            ${list.venues.length} venue${list.venues.length !== 1 ? 's' : ''}
                        </span>
                        ${list.isCollaborative ? `
                            <span class="stat-item">
                                <i class="fas fa-users"></i>
                                ${list.collaborators.length + 1} member${list.collaborators.length > 0 ? 's' : ''}
                            </span>
                        ` : ''}
                        <span class="stat-item">
                            <i class="fas fa-bookmark"></i>
                            ${list.saves} saves
                        </span>
                    </div>
                    ${list.collaborators.length > 0 ? `
                        <div class="list-collaborators">
                            <span class="collab-label">Shared with:</span>
                            <div class="collab-avatars">
                                ${list.collaborators.slice(0, 3).map(name => `
                                    <div class="collab-avatar" title="${name}">
                                        ${name.charAt(0)}
                                    </div>
                                `).join('')}
                                ${list.collaborators.length > 3 ? `
                                    <div class="collab-avatar more">
                                        +${list.collaborators.length - 3}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    <div class="list-actions">
                        <button class="btn-view" data-list-id="${list.id}">
                            <i class="fas fa-eye"></i>
                            View
                        </button>
                        <button class="btn-edit" data-list-id="${list.id}">
                            <i class="fas fa-edit"></i>
                            Edit
                        </button>
                        <button class="btn-share" data-list-id="${list.id}">
                            <i class="fas fa-share-alt"></i>
                            Share
                        </button>
                        <button class="btn-more" data-list-id="${list.id}">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Render templates
    function renderTemplates() {
        const templatesContainer = document.getElementById('listTemplates');
        if (!templatesContainer) return;

        templatesContainer.innerHTML = state.listTemplates.map(template => `
            <div class="template-card" data-template-id="${template.id}">
                <div class="template-icon">
                    <i class="fas ${template.icon}"></i>
                </div>
                <h4>${template.name}</h4>
                <p>${template.description}</p>
                <button class="btn-use-template" data-template-id="${template.id}">
                    <i class="fas fa-plus"></i>
                    Use Template
                </button>
            </div>
        `).join('');

        // Attach template listeners
        document.querySelectorAll('.btn-use-template').forEach(btn => {
            btn.addEventListener('click', () => {
                const templateId = btn.dataset.templateId;
                useTemplate(templateId);
            });
        });
    }

    // Attach list card listeners
    function attachListCardListeners() {
        // View buttons
        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const listId = btn.dataset.listId;
                viewList(listId);
            });
        });

        // Edit buttons
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const listId = btn.dataset.listId;
                editList(listId);
            });
        });

        // Share buttons
        document.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const listId = btn.dataset.listId;
                shareList(listId);
            });
        });

        // More buttons
        document.querySelectorAll('.btn-more').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const listId = btn.dataset.listId;
                showListOptions(listId);
            });
        });
    }

    // Show create list modal
    function showCreateListModal() {
        const modal = document.getElementById('createListModal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-content create-list-content">
                <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
                <h2><i class="fas fa-plus-circle"></i> Create New List</h2>
                <form id="createListForm" class="list-form">
                    <div class="form-group">
                        <label for="listName">List Name *</label>
                        <input type="text" id="listName" required placeholder="e.g., Date Night Favorites">
                    </div>
                    <div class="form-group">
                        <label for="listCategory">Category *</label>
                        <select id="listCategory" required>
                            <option value="">Select a category</option>
                            <option value="Date Night">Date Night</option>
                            <option value="Want to Try">Want to Try</option>
                            <option value="Favorites">Favorites</option>
                            <option value="Groups">Groups</option>
                            <option value="Business">Business</option>
                            <option value="Special Occasions">Special Occasions</option>
                            <option value="Custom">Custom</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="listDescription">Description</label>
                        <textarea id="listDescription" rows="3" placeholder="What's this list about?"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="isPublic">
                            <span>Make this list public</span>
                        </label>
                        <small>Public lists can be discovered and saved by others</small>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="isCollaborative">
                            <span>Enable collaboration</span>
                        </label>
                        <small>Allow others to add venues to this list</small>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').style.display='none'">
                            Cancel
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-check"></i>
                            Create List
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Handle form submission
        document.getElementById('createListForm').addEventListener('submit', (e) => {
            e.preventDefault();
            createList();
        });

        modal.style.display = 'flex';
    }

    // Create list
    function createList() {
        // Auth gate
        var isAuthed = !!(localStorage.getItem('sl_jwt_token') || localStorage.getItem('sl_jwt_v2'));
        if (!isAuthed) {
            try {
                if (window.SLAuth && typeof window.SLAuth.openLogin === 'function') window.SLAuth.openLogin('login');
                else showNotification && showNotification('Please sign in to create a list', 'error');
            } catch(e) {}
            return;
        }
        const name = document.getElementById('listName').value;
        const category = document.getElementById('listCategory').value;
        const description = document.getElementById('listDescription').value;
        const isPublic = document.getElementById('isPublic').checked;
        const isCollaborative = document.getElementById('isCollaborative').checked;

        const newList = {
            id: 'list' + Date.now(),
            name,
            category,
            description,
            isPublic,
            isCollaborative,
            collaborators: [],
            venues: [],
            createdDate: new Date().toISOString().split('T')[0],
            lastModified: new Date().toISOString().split('T')[0],
            saves: 0,
            views: 0
        };

        state.lists.unshift(newList);
        localStorage.setItem('userLists', JSON.stringify(state.lists));
        
        document.getElementById('createListModal').style.display = 'none';
        renderListsGrid();
        showNotification('List created successfully!', 'success');
    }

    // View list
    function viewList(listId) {
        const list = state.lists.find(l => l.id === listId);
        if (!list) return;

        const modal = document.getElementById('listDetailModal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-content list-detail-content">
                <button class="modal-close" onclick="this.closest('.modal').style.display='none'">
                    <i class="fas fa-times"></i>
                </button>
                <div class="list-detail-header">
                    <div>
                        <h2>${list.name}</h2>
                        <div class="list-meta">
                            <span class="list-category-badge">${list.category}</span>
                            ${list.isPublic ? '<span class="badge-public"><i class="fas fa-globe"></i> Public</span>' : '<span class="badge-private"><i class="fas fa-lock"></i> Private</span>'}
                            ${list.isCollaborative ? '<span class="badge-collaborative"><i class="fas fa-users"></i> Collaborative</span>' : ''}
                        </div>
                        <p class="list-description-full">${list.description}</p>
                    </div>
                    <div class="list-detail-actions">
                        <button class="btn-secondary" onclick="window.listsPageEnhanced.editList('${list.id}')">
                            <i class="fas fa-edit"></i>
                            Edit
                        </button>
                        <button class="btn-secondary" onclick="window.listsPageEnhanced.shareList('${list.id}')">
                            <i class="fas fa-share-alt"></i>
                            Share
                        </button>
                    </div>
                </div>
                
                <div class="list-detail-stats">
                    <div class="stat-box">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>
                            <strong>${list.venues.length}</strong>
                            <span>Venues</span>
                        </div>
                    </div>
                    <div class="stat-box">
                        <i class="fas fa-bookmark"></i>
                        <div>
                            <strong>${list.saves}</strong>
                            <span>Saves</span>
                        </div>
                    </div>
                    <div class="stat-box">
                        <i class="fas fa-eye"></i>
                        <div>
                            <strong>${list.views}</strong>
                            <span>Views</span>
                        </div>
                    </div>
                    ${list.isCollaborative ? `
                        <div class="stat-box">
                            <i class="fas fa-users"></i>
                            <div>
                                <strong>${list.collaborators.length + 1}</strong>
                                <span>Members</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${list.collaborators.length > 0 ? `
                    <div class="list-detail-section">
                        <h3><i class="fas fa-users"></i> Collaborators</h3>
                        <div class="collaborators-list">
                            <div class="collaborator-item">
                                <div class="collaborator-avatar owner">You</div>
                                <div class="collaborator-info">
                                    <strong>You</strong>
                                    <span>Owner</span>
                                </div>
                            </div>
                            ${list.collaborators.map(name => `
                                <div class="collaborator-item">
                                    <div class="collaborator-avatar">${name.charAt(0)}</div>
                                    <div class="collaborator-info">
                                        <strong>${name}</strong>
                                        <span>Collaborator</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="list-detail-section">
                    <div class="section-header">
                        <h3><i class="fas fa-map-marker-alt"></i> Venues (${list.venues.length})</h3>
                        <button class="btn-add-venue" onclick="window.listsPageEnhanced.addVenueToList('${list.id}')">
                            <i class="fas fa-plus"></i>
                            Add Venue
                        </button>
                    </div>
                    ${list.venues.length > 0 ? `
                        <div class="venues-list">
                            ${list.venues.map(venue => `
                                <div class="venue-item">
                                    <div class="venue-image-small">
                                        <img src="${venue.image}" alt="${venue.name}">
                                    </div>
                                    <div class="venue-info">
                                        <h4>${venue.name}</h4>
                                        <div class="venue-meta">
                                            <span class="venue-type">${venue.type}</span>
                                            <span class="venue-rating">
                                                <i class="fas fa-star"></i>
                                                ${venue.rating}
                                            </span>
                                            <span class="venue-price">${'$'.repeat(venue.priceLevel)}</span>
                                        </div>
                                        ${venue.notes ? `<p class="venue-notes">${venue.notes}</p>` : ''}
                                        <div class="venue-added-by">
                                            Added by ${venue.addedBy} on ${venue.addedDate}
                                        </div>
                                    </div>
                                    <div class="venue-actions-small">
                                        <button class="btn-icon" title="View Details">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-icon" title="Remove">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-venues">
                            <i class="fas fa-map-marker-alt"></i>
                            <p>No venues in this list yet</p>
                            <button class="btn-primary" onclick="window.listsPageEnhanced.addVenueToList('${list.id}')">
                                <i class="fas fa-plus"></i>
                                Add Your First Venue
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    // Edit list
    function editList(listId) {
        showNotification('Edit functionality coming soon!', 'info');
    }

    // Share list
    function shareList(listId) {
        const list = state.lists.find(l => l.id === listId);
        if (!list) return;

        const shareData = {
            title: list.name,
            text: `Check out my list: ${list.name} - ${list.description}`,
            url: window.location.href + '?list=' + listId
        };

        if (navigator.share) {
            navigator.share(shareData)
                .then(() => showNotification('List shared!', 'success'))
                .catch(() => copyToClipboard(shareData.url));
        } else {
            copyToClipboard(shareData.url);
        }
    }

    // Show list options
    function showListOptions(listId) {
        showNotification('More options coming soon!', 'info');
    }

    // Use template
    function useTemplate(templateId) {
        const template = state.listTemplates.find(t => t.id === templateId);
        if (!template) return;

        // Pre-fill create modal with template data
        showCreateListModal();
        setTimeout(() => {
            document.getElementById('listName').value = template.name;
            document.getElementById('listDescription').value = template.description;
        }, 100);
    }

    // Add venue to list
    function addVenueToList(listId) {
        showNotification('Add venue functionality coming soon!', 'info');
    }

    // Filter lists by category
    function filterByCategory(category) {
        state.activeCategory = category;
        renderListsGrid();
    }

    // Update lists count
    function updateListsCount(count) {
        const countElement = document.getElementById('listsCount');
        if (countElement) {
            countElement.textContent = `${count} list${count !== 1 ? 's' : ''}`;
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        // Create list button
        const createBtn = document.getElementById('createListBtn');
        if (createBtn) {
            createBtn.addEventListener('click', showCreateListModal);
        }

        // Category filters
        document.querySelectorAll('.category-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.category-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const category = btn.dataset.category;
                filterByCategory(category);
            });
        });

        // Search
        const searchInput = document.getElementById('listsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filtered = state.lists.filter(list =>
                    list.name.toLowerCase().includes(query) ||
                    list.description.toLowerCase().includes(query) ||
                    list.category.toLowerCase().includes(query)
                );
                // Re-render with filtered results
                const listsContainer = document.getElementById('listsGrid');
                if (listsContainer) {
                    listsContainer.innerHTML = filtered.map(list => createListCard(list)).join('');
                    attachListCardListeners();
                    updateListsCount(filtered.length);
                }
            });
        }
    }

    // Setup scroll animations
    function setupScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);

        document.querySelectorAll('.list-card, .template-card').forEach(card => {
            observer.observe(card);
        });
    }

    // Utility functions
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Link copied to clipboard!', 'success');
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Export functions for modal use
    window.listsPageEnhanced = {
        showCreateListModal,
        viewList,
        editList,
        shareList,
        addVenueToList
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();