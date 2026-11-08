// SceneLink - Activity Feed Component

class ActivityFeed {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.activities = [];
        this.page = 1;
        this.loading = false;
    }

    load() {
        this.activities = this.getSampleActivities();
        this.render();
        this.initInfiniteScroll();
    }

    getSampleActivities() {
        return [
            {
                id: 1,
                type: 'check-in',
                user: {
                    name: 'Sarah Chen',
                    username: 'sarahchen',
                    avatar: 'SC'
                },
                venue: {
                    name: 'Mamma Maria',
                    category: 'Italian Restaurant',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.8
                },
                text: 'Amazing pasta and wine! The carbonara is to die for. Perfect date night spot!',
                photos: [
                    '/assets/img/placeholder-venue.svg',
                    '/assets/img/placeholder-venue.svg'
                ],
                time: new Date(Date.now() - 7200000).toISOString(),
                likes: 24,
                comments: 5,
                shares: 2,
                liked: false
            },
            {
                id: 2,
                type: 'review',
                user: {
                    name: 'Mike Johnson',
                    username: 'mikej',
                    avatar: 'MJ'
                },
                venue: {
                    name: 'Neptune Oyster',
                    category: 'Seafood',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.9
                },
                text: 'Best lobster roll in Boston! Worth the wait. Fresh oysters were incredible too.',
                rating: 5,
                time: new Date(Date.now() - 14400000).toISOString(),
                likes: 31,
                comments: 8,
                shares: 4,
                liked: true
            },
            {
                id: 3,
                type: 'list-created',
                user: {
                    name: 'Emma Davis',
                    username: 'emmad',
                    avatar: 'ED'
                },
                list: {
                    name: 'Best Brunch Spots',
                    icon: '🥞',
                    itemCount: 8
                },
                text: 'Just created a new list of my favorite brunch places in Boston!',
                time: new Date(Date.now() - 28800000).toISOString(),
                likes: 18,
                comments: 3,
                shares: 6,
                liked: false
            },
            {
                id: 4,
                type: 'recommendation',
                user: {
                    name: 'Tom Wilson',
                    username: 'tomw',
                    avatar: 'TW'
                },
                venue: {
                    name: 'The Beehive',
                    category: 'Live Music',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.5
                },
                text: 'If you love jazz, you have to check this place out! Live music every night.',
                time: new Date(Date.now() - 43200000).toISOString(),
                likes: 15,
                comments: 4,
                shares: 3,
                liked: false
            },
            {
                id: 5,
                type: 'reservation',
                user: {
                    name: 'Alex Rivera',
                    username: 'alexrivera',
                    avatar: 'AR'
                },
                venue: {
                    name: 'Bistro du Midi',
                    category: 'French',
                    image: '/assets/img/placeholder-venue.svg',
                    rating: 4.5
                },
                text: 'Just booked a table for Saturday night! Can\'t wait!',
                reservationDetails: {
                    date: '2024-11-16',
                    time: '7:00 PM',
                    partySize: 2
                },
                time: new Date(Date.now() - 86400000).toISOString(),
                likes: 12,
                comments: 2,
                shares: 1,
                liked: false
            }
        ];
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        
        this.activities.forEach(activity => {
            const item = this.createActivityItem(activity);
            this.container.appendChild(item);
        });
    }

    createActivityItem(activity) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        const typeLabels = {
            'check-in': 'Check-in',
            'review': 'Review',
            'list-created': 'New List',
            'recommendation': 'Recommendation',
            'reservation': 'Reservation'
        };

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
        } else if (activity.list) {
            contentHTML = `
                <div style="padding: var(--spacing-md); background: var(--dark-lighter); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                    <div style="display: flex; align-items: center; gap: var(--spacing-md);">
                        <div style="font-size: 2rem;">${activity.list.icon}</div>
                        <div>
                            <strong>${activity.list.name}</strong>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${activity.list.itemCount} places</div>
                        </div>
                    </div>
                </div>
            `;
        }

        const photosHTML = activity.photos ? `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                ${activity.photos.map(photo => `
                    <img src="${photo}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-md);">
                `).join('')}
            </div>
        ` : '';

        item.innerHTML = `
            <div class="activity-header">
                <div class="activity-avatar">${activity.user.avatar}</div>
                <div class="activity-meta">
                    <div class="activity-user">${activity.user.name}</div>
                    <div class="activity-time">${timeAgo(activity.time)}</div>
                </div>
                <span class="activity-type-badge">${typeLabels[activity.type]}</span>
            </div>
            
            <div class="activity-content">
                <p class="activity-text">${activity.text}</p>
                ${activity.rating ? `<div style="color: var(--gold-primary); margin: var(--spacing-sm) 0;">${'★'.repeat(activity.rating)}</div>` : ''}
                ${contentHTML}
                ${photosHTML}
                ${activity.reservationDetails ? `
                    <div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: rgba(212, 175, 55, 0.1); border: 1px solid var(--gold-primary); border-radius: var(--radius-md);">
                        <div style="color: var(--gold-primary); font-weight: 600; margin-bottom: var(--spacing-xs);">Reservation Details</div>
                        <div style="color: var(--text-secondary); font-size: 0.9rem;">
                            ${formatDate(activity.reservationDetails.date)} at ${activity.reservationDetails.time} • Party of ${activity.reservationDetails.partySize}
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="activity-actions">
                <button class="activity-action-btn ${activity.liked ? 'liked' : ''}" onclick="toggleLike(${activity.id})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${activity.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${activity.likes}</span>
                </button>
                <button class="activity-action-btn" onclick="showComments(${activity.id})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${activity.comments}</span>
                </button>
                <button class="activity-action-btn" onclick="shareActivity(${activity.id})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span>${activity.shares}</span>
                </button>
            </div>
        `;

        return item;
    }

    initInfiniteScroll() {
        if (!this.container) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !this.loading) {
                this.loadMore();
            }
        }, { threshold: 0.5 });

        // Observe last item
        const lastItem = this.container.lastElementChild;
        if (lastItem) {
            observer.observe(lastItem);
        }
    }

    loadMore() {
        this.loading = true;
        
        // Simulate loading more activities
        setTimeout(() => {
            notify.info('Loading', 'Loading more activities...');
            this.loading = false;
        }, 1000);
    }
}

// Global functions for activity interactions
function toggleLike(activityId) {
    notify.success('Liked!', 'You liked this activity');
}

function showComments(activityId) {
    notify.info('Comments', 'Comments feature coming soon');
}

function shareActivity(activityId) {
    notify.success('Shared!', 'Activity shared successfully');
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityFeed;
}