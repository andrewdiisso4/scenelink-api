// SceneLink - Profile Page JavaScript (Social Network Style)

let currentTab = 'feed';
let userProfile = {
    name: "Alex Rivera",
    username: "alexrivera",
    bio: "Food enthusiast | Boston explorer | Always looking for the next great spot",
    location: "Boston, MA",
    avatar: "https://ui-avatars.com/api/?name=Alex+Rivera&size=150&background=D4AF37&color=0a0a0a",
    cover: "/assets/img/placeholder-venue.svg",
    stats: {
        saved: 127,
        reviews: 45,
        followers: 234,
        following: 189,
        lists: 12
    },
    socialConnections: {
        instagram: null,
        twitter: null,
        facebook: null
    }
};

// Friends data
const friends = [
    { name: "Sarah Chen", username: "@sarahchen", avatar: "SC", mutual: 12 },
    { name: "Mike Johnson", username: "@mikej", avatar: "MJ", mutual: 8 },
    { name: "Emma Davis", username: "@emmad", avatar: "ED", mutual: 15 },
    { name: "Tom Wilson", username: "@tomw", avatar: "TW", mutual: 6 }
];

// Activity feed data
const activityFeed = [
    {
        id: 1,
        type: "check-in",
        user: "Alex Rivera",
        avatar: "AR",
        action: "checked in at",
        venue: {
            name: "Mamma Maria",
            category: "Italian Restaurant",
            image: "/assets/img/placeholder-venue.svg"
        },
        text: "Amazing pasta and wine! Highly recommend the carbonara.",
        time: "2 hours ago",
        likes: 12,
        comments: 3
    },
    {
        id: 2,
        type: "review",
        user: "Alex Rivera",
        avatar: "AR",
        action: "reviewed",
        venue: {
            name: "Neptune Oyster",
            category: "Seafood",
            image: "/assets/img/placeholder-venue.svg"
        },
        text: "Best lobster roll in Boston! Worth the wait.",
        rating: 5,
        time: "1 day ago",
        likes: 24,
        comments: 7
    },
    {
        id: 3,
        type: "list",
        user: "Alex Rivera",
        avatar: "AR",
        action: "created a new list",
        listName: "Date Night Favorites",
        listIcon: "❤️",
        text: "My go-to romantic spots in Boston",
        time: "3 days ago",
        likes: 18,
        comments: 5
    },
    {
        id: 4,
        type: "save",
        user: "Alex Rivera",
        avatar: "AR",
        action: "saved",
        venue: {
            name: "The Beehive",
            category: "Live Music",
            image: "/assets/img/placeholder-venue.svg"
        },
        text: "Can't wait to check out the jazz night!",
        time: "5 days ago",
        likes: 8,
        comments: 2
    }
];

// Reviews data
const reviews = [
    {
        id: 1,
        venue: "Mamma Maria",
        category: "Italian",
        rating: 5,
        text: "Absolutely incredible Italian food! The ambiance is perfect for a romantic dinner. Service was impeccable and the wine selection is outstanding.",
        date: "2024-11-10",
        likes: 24,
        helpful: 18,
        image: "/assets/img/placeholder-venue.svg"
    },
    {
        id: 2,
        venue: "Neptune Oyster",
        category: "Seafood",
        rating: 5,
        text: "Best lobster roll I've ever had! Fresh oysters and great atmosphere. Definitely worth the wait.",
        date: "2024-11-08",
        likes: 31,
        helpful: 25,
        image: "/assets/img/placeholder-venue.svg"
    }
];

// Photos data
const photos = [
    { url: "/assets/img/placeholder-venue.svg", venue: "Mamma Maria", likes: 45 },
    { url: "/assets/img/placeholder-venue.svg", venue: "Neptune Oyster", likes: 38 },
    { url: "/assets/img/placeholder-venue.svg", venue: "Toro", likes: 52 },
    { url: "/assets/img/placeholder-venue.svg", venue: "Drink", likes: 41 },
    { url: "/assets/img/placeholder-venue.svg", venue: "Yvonne's", likes: 67 },
    { url: "/assets/img/placeholder-venue.svg", venue: "Oleana", likes: 29 }
];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadProfile();
    loadFriends();
    loadActivityFeed();
    initEventListeners();
});

function loadProfile() {
    // Load from storage or use default
    const stored = storage.get('scenelink_profile');
    if (stored) {
        userProfile = { ...userProfile, ...stored };
    }
    
    document.getElementById('profileName').textContent = userProfile.name;
    document.getElementById('profileUsername').textContent = `@${userProfile.username}`;
    document.getElementById('profileBio').textContent = userProfile.bio;
    
    // Update social connections
    updateSocialConnections();
}

function loadFriends() {
    const container = document.getElementById('friendsList');
    container.innerHTML = '';
    
    friends.slice(0, 4).forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div class="friend-avatar-small">${friend.avatar}</div>
            <div class="friend-info-small">
                <div class="friend-name-small">${friend.name}</div>
                <div class="friend-mutual">${friend.mutual} mutual</div>
            </div>
        `;
        item.onclick = () => notify.info('Profile', `Viewing ${friend.name}'s profile`);
        container.appendChild(item);
    });
}

function loadActivityFeed() {
    const container = document.getElementById('activityFeed');
    container.innerHTML = '';
    
    activityFeed.forEach(activity => {
        const item = createActivityItem(activity);
        container.appendChild(item);
    });
}

function createActivityItem(activity) {
    const item = document.createElement('div');
    item.className = 'activity-item';
    
    let contentHTML = '';
    
    if (activity.venue) {
        contentHTML = `
            <div class="activity-venue">
                <img src="${activity.venue.image}" alt="${activity.venue.name}" class="venue-image-small">
                <div class="venue-info">
                    <div class="venue-name">${activity.venue.name}</div>
                    <div class="venue-category">${activity.venue.category}</div>
                </div>
            </div>
        `;
    } else if (activity.listName) {
        contentHTML = `
            <div style="padding: var(--spacing-md); background: var(--dark-lighter); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-sm);">
                    <div style="font-size: 2rem;">${activity.listIcon}</div>
                    <strong>${activity.listName}</strong>
                </div>
            </div>
        `;
    }
    
    item.innerHTML = `
        <div class="activity-header">
            <div class="activity-avatar">${activity.avatar}</div>
            <div class="activity-meta">
                <div class="activity-user">${activity.user}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
            <span class="activity-type-badge">${activity.type.replace('-', ' ')}</span>
        </div>
        
        <div class="activity-content">
            <p class="activity-text">${activity.action} ${activity.venue ? activity.venue.name : activity.listName || ''}</p>
            ${contentHTML}
            ${activity.text ? `<p style="color: var(--text-secondary); margin-top: var(--spacing-md);">${activity.text}</p>` : ''}
            ${activity.rating ? `<div style="color: var(--gold-primary); margin-top: var(--spacing-sm);">${'★'.repeat(activity.rating)}</div>` : ''}
        </div>
        
        <div class="activity-actions">
            <button class="activity-action-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span>${activity.likes}</span>
            </button>
            <button class="activity-action-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${activity.comments}</span>
            </button>
            <button class="activity-action-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                Share
            </button>
        </div>
    `;
    
    return item;
}

function loadReviews() {
    const container = document.getElementById('reviewsTab');
    container.innerHTML = '';
    
    reviews.forEach(review => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-header">
                <div class="activity-avatar">AR</div>
                <div class="activity-meta">
                    <div class="activity-user">${userProfile.name}</div>
                    <div class="activity-time">${formatDate(review.date)}</div>
                </div>
                <div style="color: var(--gold-primary);">${'★'.repeat(review.rating)}</div>
            </div>
            
            <div class="activity-content">
                <div class="activity-venue">
                    <img src="${review.image}" alt="${review.venue}" class="venue-image-small">
                    <div class="venue-info">
                        <div class="venue-name">${review.venue}</div>
                        <div class="venue-category">${review.category}</div>
                    </div>
                </div>
                <p class="activity-text">${review.text}</p>
            </div>
            
            <div class="activity-actions">
                <button class="activity-action-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${review.likes}</span>
                </button>
                <button class="activity-action-btn">
                    <span>${review.helpful} found this helpful</span>
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

function loadPhotos() {
    const container = document.getElementById('photosTab');
    container.innerHTML = '<div class="photos-grid"></div>';
    const grid = container.querySelector('.photos-grid');
    
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--spacing-md);';
    
    photos.forEach(photo => {
        const item = document.createElement('div');
        item.style.cssText = 'position: relative; aspect-ratio: 1; border-radius: var(--radius-md); overflow: hidden; cursor: pointer; transition: all var(--transition);';
        item.innerHTML = `
            <img src="${photo.url}" alt="${photo.venue}" style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: var(--spacing-md); background: linear-gradient(transparent, rgba(0,0,0,0.8)); color: white;">
                <div style="font-weight: 600; margin-bottom: 4px;">${photo.venue}</div>
                <div style="font-size: 0.85rem; opacity: 0.8;">❤️ ${photo.likes}</div>
            </div>
        `;
        item.onmouseenter = () => item.style.transform = 'scale(1.05)';
        item.onmouseleave = () => item.style.transform = 'scale(1)';
        grid.appendChild(item);
    });
}

function loadLists() {
    const container = document.getElementById('listsTab');
    const lists = storage.get('scenelink_lists') || [];
    
    container.innerHTML = '<div class="lists-grid"></div>';
    const grid = container.querySelector('.lists-grid');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--spacing-lg);';
    
    if (lists.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                <h3>No Lists Yet</h3>
                <p>Create your first list to organize your favorite places</p>
                <button class="btn-primary" onclick="window.location.href='lists.html'" style="margin-top: 20px;">Create List</button>
            </div>
        `;
        return;
    }
    
    lists.forEach(list => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div style="font-size: 2.5rem; margin-bottom: var(--spacing-md);">${list.icon}</div>
            <h3>${list.name}</h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: var(--spacing-md);">${list.description}</p>
            <div style="color: var(--text-muted); font-size: 0.85rem;">${list.itemCount} places</div>
        `;
        card.onclick = () => window.location.href = 'lists.html';
        grid.appendChild(card);
    });
}

function updateSocialConnections() {
    const connections = ['instagram', 'twitter', 'facebook'];
    
    connections.forEach(platform => {
        const item = document.getElementById(`${platform}Connection`);
        if (!item) return;
        
        const isConnected = userProfile.socialConnections[platform];
        const statusEl = item.querySelector('.connection-status');
        const btn = item.querySelector('.connect-btn');
        
        if (isConnected) {
            statusEl.textContent = `@${isConnected}`;
            statusEl.style.color = 'var(--success)';
            btn.textContent = 'Disconnect';
            btn.style.background = 'var(--dark-card)';
            btn.style.color = 'var(--text-secondary)';
            btn.style.border = '1px solid var(--border-color)';
            item.classList.add('connected');
        } else {
            statusEl.textContent = 'Not connected';
            btn.textContent = 'Connect';
        }
        
        btn.onclick = () => toggleConnection(platform);
    });
}

function toggleConnection(platform) {
    if (userProfile.socialConnections[platform]) {
        userProfile.socialConnections[platform] = null;
        notify.info('Disconnected', `${platform} has been disconnected`);
    } else {
        const username = prompt(`Enter your ${platform} username:`);
        if (username) {
            userProfile.socialConnections[platform] = username;
            notify.success('Connected!', `${platform} connected successfully`);
        }
    }
    
    storage.set('scenelink_profile', userProfile);
    updateSocialConnections();
}

function initEventListeners() {
    // Tab switching
    document.querySelectorAll('.activity-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.activity-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            const tabName = this.dataset.tab;
            document.getElementById(`${tabName}Tab`).classList.add('active');
            
            // Load content for tab
            if (tabName === 'reviews' && document.getElementById('reviewsTab').children.length === 0) {
                loadReviews();
            } else if (tabName === 'photos' && document.getElementById('photosTab').children.length === 0) {
                loadPhotos();
            } else if (tabName === 'lists' && document.getElementById('listsTab').children.length === 0) {
                loadLists();
            }
        });
    });
    
    // Edit profile
    document.getElementById('editProfileBtn').addEventListener('click', openEditModal);
    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('editProfileForm').addEventListener('submit', handleEditProfile);
    
    // Share profile
    document.getElementById('shareProfileBtn').addEventListener('click', () => {
        notify.success('Link Copied!', 'Profile link copied to clipboard');
    });
    
    // Find friends
    document.getElementById('findFriendsBtn').addEventListener('click', () => {
        notify.info('Find Friends', 'Friend discovery feature coming soon');
    });
    
    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => {
        notify.info('Settings', 'Settings page coming soon');
    });
    
    // Edit cover/avatar
    document.getElementById('editCoverBtn')?.addEventListener('click', () => {
        notify.info('Edit Cover', 'Cover photo upload coming soon');
    });
    
    document.getElementById('editAvatarBtn')?.addEventListener('click', () => {
        notify.info('Edit Avatar', 'Avatar upload coming soon');
    });
}

function openEditModal() {
    document.getElementById('editName').value = userProfile.name;
    document.getElementById('editUsername').value = userProfile.username;
    document.getElementById('editBio').value = userProfile.bio;
    document.getElementById('editLocation').value = userProfile.location;
    
    document.getElementById('editProfileModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    document.getElementById('editProfileModal').classList.remove('active');
    document.body.style.overflow = '';
}

function handleEditProfile(e) {
    e.preventDefault();
    
    userProfile.name = document.getElementById('editName').value;
    userProfile.username = document.getElementById('editUsername').value;
    userProfile.bio = document.getElementById('editBio').value;
    userProfile.location = document.getElementById('editLocation').value;
    
    storage.set('scenelink_profile', userProfile);
    
    document.getElementById('profileName').textContent = userProfile.name;
    document.getElementById('profileUsername').textContent = `@${userProfile.username}`;
    document.getElementById('profileBio').textContent = userProfile.bio;
    
    closeEditModal();
    notify.success('Profile Updated!', 'Your changes have been saved');
}