// SceneLink - Social Feed Functionality
// Real-time updates, group planning, voting, and social interactions

// State management
const socialState = {
    posts: [],
    currentUser: {
        id: 1,
        name: 'You',
        avatar: 'https://ui-avatars.com/api/?name=You&size=50&background=D4AF37&color=0a0a0a'
    },
    filters: {
        type: 'all', // all, friends, groups, events
        sortBy: 'recent' // recent, popular, trending
    }
};

// Initialize social feed
document.addEventListener('DOMContentLoaded', function() {
    initializeSocialFeed();
    setupEventListeners();
    loadPosts();
});

// Initialize social feed
function initializeSocialFeed() {
    console.log('Social feed initialized');
    
    // Load user preferences
    loadUserPreferences();
    
    // Setup real-time updates (mock)
    setupRealTimeUpdates();
}

// Setup event listeners
function setupEventListeners() {
    // Create post input
    const createPostInput = document.querySelector('.create-post-input');
    if (createPostInput) {
        createPostInput.addEventListener('click', openCreatePostModal);
    }
    
    // Post action buttons in create post card
    document.querySelectorAll('.create-post-card .post-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent.trim();
            handleCreatePostAction(action);
        });
    });
    
    // Like buttons
    document.querySelectorAll('.post-actions .post-action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const action = this.textContent.trim().toLowerCase();
            const post = this.closest('.feed-post');
            handlePostAction(action, post);
        });
    });
    
    // Vote buttons
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            handleVote(this);
        });
    });
    
    // Group action buttons
    document.querySelectorAll('.group-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent.trim();
            handleGroupAction(action);
        });
    });
    
    // Story items
    document.querySelectorAll('.story-item').forEach(item => {
        item.addEventListener('click', function() {
            const name = this.querySelector('.story-name').textContent;
            viewStory(name);
        });
    });
    
    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.textContent.trim();
            handleQuickAction(action);
        });
    });
    
    // Follow buttons
    document.querySelectorAll('.btn-follow').forEach(btn => {
        btn.addEventListener('click', function() {
            handleFollow(this);
        });
    });
}

// Handle create post action
function handleCreatePostAction(action) {
    console.log('Create post action:', action);
    
    switch(action) {
        case 'Check In':
            openCheckInModal();
            break;
        case 'Photo':
            openPhotoUpload();
            break;
        case 'Review':
            openReviewModal();
            break;
    }
}

// Handle post actions
function handlePostAction(action, postElement) {
    console.log('Post action:', action);
    
    switch(action) {
        case 'like':
            toggleLike(postElement);
            break;
        case 'comment':
            openComments(postElement);
            break;
        case 'share':
            sharePost(postElement);
            break;
        case 'save':
            savePost(postElement);
            break;
    }
}

// Toggle like
function toggleLike(postElement) {
    const likeBtn = postElement.querySelector('.post-actions .post-action-btn');
    const icon = likeBtn.querySelector('i');
    const statsLikes = postElement.querySelector('.post-stats span:first-child');
    
    if (icon.classList.contains('far')) {
        // Like
        icon.classList.remove('far');
        icon.classList.add('fas');
        likeBtn.style.color = '#D4AF37';
        
        // Update count
        const currentCount = parseInt(statsLikes.textContent.match(/\d+/)[0]);
        statsLikes.innerHTML = `<i class="fas fa-heart"></i> ${currentCount + 1} likes`;
        
        // Animation
        icon.style.transform = 'scale(1.3)';
        setTimeout(() => {
            icon.style.transform = 'scale(1)';
        }, 200);
    } else {
        // Unlike
        icon.classList.remove('fas');
        icon.classList.add('far');
        likeBtn.style.color = '';
        
        // Update count
        const currentCount = parseInt(statsLikes.textContent.match(/\d+/)[0]);
        statsLikes.innerHTML = `<i class="fas fa-heart"></i> ${currentCount - 1} likes`;
    }
}

// Open comments
function openComments(postElement) {
    alert('Comments feature coming soon!');
    // TODO: Implement comments modal
}

// Share post
function sharePost(postElement) {
    if (navigator.share) {
        navigator.share({
            title: 'Check out this post on SceneLink',
            text: 'Found something great on SceneLink!',
            url: window.location.href
        }).catch(err => console.log('Error sharing:', err));
    } else {
        // Fallback: Copy link
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            alert('Link copied to clipboard!');
        });
    }
}

// Save post
function savePost(postElement) {
    const saveBtn = postElement.querySelector('.post-actions .post-action-btn:last-child');
    const icon = saveBtn.querySelector('i');
    
    if (icon.classList.contains('far')) {
        icon.classList.remove('far');
        icon.classList.add('fas');
        saveBtn.style.color = '#D4AF37';
        showNotification('Post saved to your collection');
    } else {
        icon.classList.remove('fas');
        icon.classList.add('far');
        saveBtn.style.color = '';
        showNotification('Post removed from collection');
    }
}

// Handle vote
function handleVote(button) {
    const voteOption = button.closest('.vote-option');
    const allOptions = document.querySelectorAll('.vote-option');
    
    // Remove active state from all
    allOptions.forEach(opt => {
        opt.style.borderColor = '';
        const btn = opt.querySelector('.vote-btn');
        btn.style.background = 'rgba(212, 175, 55, 0.1)';
        btn.style.color = '#D4AF37';
    });
    
    // Add active state to clicked
    voteOption.style.borderColor = '#D4AF37';
    button.style.background = '#D4AF37';
    button.style.color = '#0a0a0a';
    
    // Update vote count
    const currentCount = parseInt(button.textContent.match(/\d+/)[0]);
    button.innerHTML = `<i class="fas fa-check"></i> Voted (${currentCount + 1})`;
    
    showNotification('Vote recorded!');
}

// Handle group actions
function handleGroupAction(action) {
    console.log('Group action:', action);
    
    switch(action) {
        case 'Join Event':
            joinEvent();
            break;
        case 'View Calendar':
            viewGroupCalendar();
            break;
    }
}

// Join event
function joinEvent() {
    const btn = event.target.closest('.group-action-btn');
    btn.innerHTML = '<i class="fas fa-check"></i> Joined';
    btn.style.background = '#D4AF37';
    btn.style.color = '#0a0a0a';
    showNotification('You\'ve joined the event!');
}

// View group calendar
function viewGroupCalendar() {
    alert('Opening group calendar...');
    // TODO: Implement calendar modal
}

// View story
function viewStory(name) {
    alert(`Viewing ${name}'s story...`);
    // TODO: Implement story viewer
}

// Handle quick actions
function handleQuickAction(action) {
    console.log('Quick action:', action);
    
    switch(action) {
        case 'Create Post':
            openCreatePostModal();
            break;
        case 'Plan Event':
            window.location.href = 'group-planning.html';
            break;
        case 'Invite Friends':
            openInviteModal();
            break;
    }
}

// Handle follow
function handleFollow(button) {
    if (button.textContent === 'Follow') {
        button.textContent = 'Following';
        button.style.background = 'rgba(212, 175, 55, 0.2)';
        button.style.color = '#D4AF37';
        showNotification('Now following!');
    } else {
        button.textContent = 'Follow';
        button.style.background = '#D4AF37';
        button.style.color = '#0a0a0a';
    }
}

// Open create post modal
function openCreatePostModal() {
    alert('Create post modal coming soon!');
    // TODO: Implement create post modal
}

// Open check-in modal
function openCheckInModal() {
    alert('Check-in feature coming soon!');
    // TODO: Implement check-in modal
}

// Open photo upload
function openPhotoUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        console.log('Photo selected:', file.name);
        // TODO: Handle photo upload
    };
    input.click();
}

// Open review modal
function openReviewModal() {
    alert('Review feature coming soon!');
    // TODO: Implement review modal
}

// Open invite modal
function openInviteModal() {
    alert('Invite friends feature coming soon!');
    // TODO: Implement invite modal
}

// Load posts
function loadPosts() {
    // Mock data - replace with API call
    console.log('Loading posts...');
}

// Load user preferences
function loadUserPreferences() {
    // Load from localStorage or API
    const prefs = localStorage.getItem('socialPreferences');
    if (prefs) {
        Object.assign(socialState.filters, JSON.parse(prefs));
    }
}

// Setup real-time updates
function setupRealTimeUpdates() {
    // Mock real-time updates
    setInterval(() => {
        // Check for new posts
        console.log('Checking for updates...');
    }, 30000); // Every 30 seconds
}

// Show notification
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #D4AF37;
        color: #0a0a0a;
        padding: 16px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Export functions for use in other files
window.socialFeed = {
    toggleLike,
    sharePost,
    savePost,
    handleVote,
    joinEvent,
    showNotification
};