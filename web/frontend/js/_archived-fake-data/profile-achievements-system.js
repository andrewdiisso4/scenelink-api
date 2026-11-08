// Profile Achievement System - Complete Functionality
// Phase 5D-A: Achievement system disabled until backend /api/achievements ships.
// Guarded init at bottom of file.

class ProfileAchievementSystem {
    constructor() {
        this.achievements = this.loadAchievements();
        this.userProgress = this.loadUserProgress();
        this.init();
    }

    init() {
        this.enhanceAchievementWidget();
        this.removeModalSection();
        this.addAchievementStats();
        this.initializeAchievementTracking();
        this.animateAchievements();
    }

    loadAchievements() {
        return {
            foodie: {
                id: 'foodie',
                name: 'Foodie',
                icon: 'fas fa-utensils',
                description: 'Visit 10 restaurants',
                requirement: 10,
                category: 'dining',
                earned: true
            },
            mixologist: {
                id: 'mixologist',
                name: 'Mixologist',
                icon: 'fas fa-cocktail',
                description: 'Try 20 different cocktails',
                requirement: 20,
                category: 'dining',
                earned: true
            },
            topReviewer: {
                id: 'top-reviewer',
                name: 'Top Reviewer',
                icon: 'fas fa-star',
                description: 'Write 25 reviews',
                requirement: 25,
                category: 'social',
                earned: true
            },
            explorer: {
                id: 'explorer',
                name: 'Explorer',
                icon: 'fas fa-map-marked-alt',
                description: 'Discover 50 venues',
                requirement: 50,
                category: 'exploration',
                earned: true
            },
            vip: {
                id: 'vip',
                name: 'VIP',
                icon: 'fas fa-crown',
                description: 'Attend 100 events',
                requirement: 100,
                category: 'events',
                earned: false,
                progress: 67
            },
            trendsetter: {
                id: 'trendsetter',
                name: 'Trendsetter',
                icon: 'fas fa-fire',
                description: 'Be first at 15 new venues',
                requirement: 15,
                category: 'social',
                earned: false,
                progress: 8
            },
            nightOwl: {
                id: 'night-owl',
                name: 'Night Owl',
                icon: 'fas fa-moon',
                description: 'Visit 30 late-night venues',
                requirement: 30,
                category: 'exploration',
                earned: false,
                progress: 22
            },
            socialButterfly: {
                id: 'social-butterfly',
                name: 'Social Butterfly',
                icon: 'fas fa-users',
                description: 'Make 50 connections',
                requirement: 50,
                category: 'social',
                earned: false,
                progress: 34
            }
        };
    }

    loadUserProgress() {
        const saved = localStorage.getItem('userAchievementProgress');
        return saved ? JSON.parse(saved) : {
            venuesVisited: 50,
            reviewsWritten: 25,
            eventsAttended: 67,
            cocktailsTried: 20,
            restaurantsVisited: 10,
            newVenuesVisited: 8,
            lateNightVenues: 22,
            connectionsMade: 34,
            totalPoints: 1250
        };
    }

    enhanceAchievementWidget() {
        const widget = document.querySelector('.profile-widget');
        if (!widget) return;

        const achievementsGrid = widget.querySelector('.achievements-grid');
        if (!achievementsGrid) return;

        // Display top 6 achievements in widget
        const topAchievements = Object.values(this.achievements).slice(0, 6);
        
        achievementsGrid.innerHTML = topAchievements.map(achievement => `
            <div class="achievement-badge ${achievement.earned ? 'earned' : ''}" 
                 data-achievement="${achievement.id}"
                 onclick="achievementSystem.showAchievementDetails('${achievement.id}')">
                <i class="${achievement.icon}"></i>
                <span class="achievement-name">${achievement.name}</span>
            </div>
        `).join('');

        // Add stats section below achievements
        const statsHTML = `
            <div class="achievement-stats-mini">
                <div class="stat-item">
                    <div class="stat-value">${this.userProgress.totalPoints}</div>
                    <div class="stat-label">Points</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${Object.values(this.achievements).filter(a => a.earned).length}</div>
                    <div class="stat-label">Earned</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${Object.keys(this.achievements).length}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>
        `;

        achievementsGrid.insertAdjacentHTML('afterend', statsHTML);
    }

    removeModalSection() {
        // Remove the "View All Achievements" button
        const viewAllBtn = document.getElementById('viewAllAchievementsBtn');
        if (viewAllBtn) {
            viewAllBtn.remove();
        }

        // Remove the modal overlay
        const modal = document.getElementById('achievementsModal');
        if (modal) {
            modal.remove();
        }
    }

    addAchievementStats() {
        const widget = document.querySelector('.profile-widget');
        if (!widget) return;

        const title = widget.querySelector('.widget-title');
        if (title) {
            title.innerHTML = `
                <i class="fas fa-trophy"></i> 
                Achievements 
                <span style="font-size: 14px; color: var(--accent-gold); margin-left: auto;">
                    ${Object.values(this.achievements).filter(a => a.earned).length}/${Object.keys(this.achievements).length}
                </span>
            `;
        }
    }

    initializeAchievementTracking() {
        // Track user interactions and update progress
        this.trackPageViews();
        this.trackVenueSaves();
        this.trackSearchActivity();
    }

    trackPageViews() {
        let venueCount = this.userProgress.venuesVisited || 0;
        
        // Simulate venue visit tracking
        if (Math.random() > 0.7) {
            venueCount++;
            this.updateProgress('venuesVisited', venueCount);
            this.checkAchievements();
        }
    }

    trackVenueSaves() {
        const savedVenues = JSON.parse(localStorage.getItem('savedVenues')) || [];
        if (savedVenues.length > this.userProgress.venuesVisited) {
            this.updateProgress('venuesVisited', savedVenues.length);
            this.checkAchievements();
        }
    }

    trackSearchActivity() {
        // Track search and filter usage
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('search-input')) {
                this.incrementProgress('searchesMade');
            }
        });
    }

    updateProgress(key, value) {
        this.userProgress[key] = value;
        localStorage.setItem('userAchievementProgress', JSON.stringify(this.userProgress));
    }

    incrementProgress(key) {
        this.userProgress[key] = (this.userProgress[key] || 0) + 1;
        this.userProgress.totalPoints = this.calculateTotalPoints();
        localStorage.setItem('userAchievementProgress', JSON.stringify(this.userProgress));
        this.checkAchievements();
    }

    calculateTotalPoints() {
        let points = 0;
        Object.values(this.achievements).forEach(achievement => {
            if (achievement.earned) {
                points += 100;
            } else if (achievement.progress) {
                points += Math.floor((achievement.progress / achievement.requirement) * 100);
            }
        });
        return points + (this.userProgress.venuesVisited || 0) * 10;
    }

    checkAchievements() {
        let newAchievements = [];

        Object.values(this.achievements).forEach(achievement => {
            if (!achievement.earned) {
                let progress = 0;

                switch(achievement.id) {
                    case 'vip':
                        progress = this.userProgress.eventsAttended || 0;
                        break;
                    case 'trendsetter':
                        progress = this.userProgress.newVenuesVisited || 0;
                        break;
                    case 'night-owl':
                        progress = this.userProgress.lateNightVenues || 0;
                        break;
                    case 'social-butterfly':
                        progress = this.userProgress.connectionsMade || 0;
                        break;
                }

                if (progress >= achievement.requirement) {
                    achievement.earned = true;
                    achievement.progress = achievement.requirement;
                    newAchievements.push(achievement);
                } else {
                    achievement.progress = progress;
                }
            }
        });

        // Show notifications for new achievements
        newAchievements.forEach(achievement => {
            this.showAchievementUnlocked(achievement);
        });

        // Update display if new achievements earned
        if (newAchievements.length > 0) {
            this.enhanceAchievementWidget();
        }
    }

    showAchievementUnlocked(achievement) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: linear-gradient(135deg, var(--accent-gold), #b8941f);
            color: #000;
            padding: 20px 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(212, 175, 55, 0.4);
            z-index: 10000;
            max-width: 300px;
            animation: slideInBounce 0.6s ease;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                <i class="${achievement.icon}" style="font-size: 24px;"></i>
                <div>
                    <div style="font-weight: 700; font-size: 16px;">Achievement Unlocked!</div>
                    <div style="font-size: 14px;">${achievement.name}</div>
                </div>
            </div>
            <div style="font-size: 12px; opacity: 0.8;">${achievement.description}</div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutBounce 0.6s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 600);
        }, 5000);
    }

    showAchievementDetails(achievementId) {
        const achievement = this.achievements[achievementId];
        if (!achievement) return;

        const progress = achievement.progress || 0;
        const progressPercent = Math.min((progress / achievement.requirement) * 100, 100);

        const detailNotification = document.createElement('div');
        detailNotification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 20, 0.95);
            backdrop-filter: blur(20px);
            border: 2px solid var(--accent-gold);
            border-radius: 20px;
            padding: 30px;
            z-index: 10000;
            max-width: 400px;
            animation: zoomIn 0.3s ease;
        `;
        
        detailNotification.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <i class="${achievement.icon}" style="font-size: 48px; color: ${achievement.earned ? 'var(--accent-gold)' : 'rgba(255,255,255,0.4)'};"></i>
                <h3 style="color: #fff; margin: 15px 0 10px; font-size: 24px;">${achievement.name}</h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 20px;">${achievement.description}</p>
                
                ${!achievement.earned ? `
                    <div style="margin-top: 20px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
                            <span>Progress</span>
                            <span>${progress}/${achievement.requirement}</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.1); border-radius: 10px; height: 8px; overflow: hidden;">
                            <div style="background: var(--accent-gold); height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                ` : `
                    <div style="color: var(--accent-gold); font-weight: 600; margin-top: 15px;">
                        ✅ COMPLETED
                    </div>
                `}
            </div>
            
            <button onclick="this.parentElement.remove()" style="
                width: 100%;
                background: var(--accent-gold);
                color: #000;
                border: none;
                padding: 12px;
                border-radius: 10px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            ">Close</button>
        `;
        
        document.body.appendChild(detailNotification);
        
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeDetail(e) {
                if (!detailNotification.contains(e.target)) {
                    detailNotification.remove();
                    document.removeEventListener('click', closeDetail);
                }
            });
        }, 100);
    }

    animateAchievements() {
        // Add entrance animations to achievement badges
        const badges = document.querySelectorAll('.achievement-badge');
        badges.forEach((badge, index) => {
            badge.style.opacity = '0';
            badge.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                badge.style.transition = 'all 0.5s ease';
                badge.style.opacity = '1';
                badge.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }
}

// Add custom animations
const animationStyles = document.createElement('style');
animationStyles.textContent = `
    @keyframes slideInBounce {
        0% {
            transform: translateX(100%) scale(0.8);
            opacity: 0;
        }
        60% {
            transform: translateX(-10px) scale(1.05);
            opacity: 1;
        }
        80% {
            transform: translateX(5px) scale(0.95);
        }
        100% {
            transform: translateX(0) scale(1);
            opacity: 1;
        }
    }
    
    @keyframes slideOutBounce {
        0% {
            transform: translateX(0) scale(1);
            opacity: 1;
        }
        20% {
            transform: translateX(-5px) scale(1.05);
        }
        100% {
            transform: translateX(100%) scale(0.8);
            opacity: 0;
        }
    }
    
    @keyframes zoomIn {
        0% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
        }
        100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
        }
    }
`;
document.head.appendChild(animationStyles);

// Initialize the achievement system
// Phase 5D-A: Skip init if widget is hidden (no backend /api/achievements yet).
(function(){
    function widgetHidden(){
        var w = document.getElementById('achievementsWidget');
        if (!w) return false; // legacy markup → run as before
        if (w.hidden) return true;
        var s = (w.getAttribute('style') || '').toLowerCase();
        if (s.indexOf('display:none') !== -1 || s.indexOf('display: none') !== -1) return true;
        return false;
    }
    if (widgetHidden()) {
        console.info('[5D-A] Achievements widget hidden \u2014 system inactive.');
        return;
    }
    window.achievementSystem = new ProfileAchievementSystem();
})();