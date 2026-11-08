// SceneLink - Common Utilities and Shared Functions

// ===================================
// NOTIFICATION SYSTEM
// ===================================

class NotificationManager {
    constructor() {
        this.container = this.createContainer();
        this.notifications = [];
    }

    createContainer() {
        let container = document.querySelector('.notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }
        return container;
    }

    show(title, message, type = 'info', duration = 5000, actions = []) {
        const notification = this.createNotification(title, message, type, actions);
        this.container.appendChild(notification);
        this.notifications.push(notification);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }

        return notification;
    }

    createNotification(title, message, type, actions) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };

        let actionsHTML = '';
        if (actions.length > 0) {
            actionsHTML = '<div class="notification-actions">';
            actions.forEach(action => {
                actionsHTML += `<button class="notification-action-btn ${action.primary ? 'primary' : ''}" onclick="${action.onClick}">${action.label}</button>`;
            });
            actionsHTML += '</div>';
        }

        notification.innerHTML = `
            <div class="notification-icon">${icons[type]}</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
                ${actionsHTML}
            </div>
            <button class="notification-close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="notification-progress"></div>
        `;

        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.remove(notification);
        });

        return notification;
    }

    remove(notification) {
        notification.classList.add('removing');
        setTimeout(() => {
            notification.remove();
            this.notifications = this.notifications.filter(n => n !== notification);
        }, 300);
    }

    success(title, message, duration) {
        return this.show(title, message, 'success', duration);
    }

    error(title, message, duration) {
        return this.show(title, message, 'error', duration);
    }

    warning(title, message, duration) {
        return this.show(title, message, 'warning', duration);
    }

    info(title, message, duration) {
        return this.show(title, message, 'info', duration);
    }
}

// Global notification instance
const notify = new NotificationManager();

// ===================================
// BOOKING SYSTEM
// ===================================

class BookingManager {
    constructor() {
        this.currentStep = 1;
        this.bookingData = {
            venue: null,
            date: null,
            time: null,
            partySize: 2,
            occasion: null,
            specialRequests: ''
        };
    }

    open(venue) {
        this.bookingData.venue = venue;
        this.currentStep = 1;
        this.showModal();
        this.renderStep();
    }

    showModal() {
        let modal = document.getElementById('bookingModal');
        if (!modal) {
            modal = this.createModal();
            document.body.appendChild(modal);
        }
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'bookingModal';
        modal.className = 'booking-modal';
        modal.innerHTML = `
            <div class="booking-content">
                <div class="booking-header">
                    <div class="booking-venue-info">
                        <img src="" alt="" class="booking-venue-image" id="bookingVenueImage">
                        <div class="booking-venue-details">
                            <h2 id="bookingVenueName"></h2>
                            <div class="booking-venue-category" id="bookingVenueCategory"></div>
                            <div class="booking-venue-rating">
                                <span>★ <span id="bookingVenueRating"></span></span>
                            </div>
                        </div>
                    </div>
                    <button class="booking-close" id="closeBooking">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="booking-body">
                    <div class="booking-steps">
                        <div class="booking-step active" data-step="1">
                            <div class="step-circle">1</div>
                            <div class="step-label">Date & Time</div>
                        </div>
                        <div class="booking-step" data-step="2">
                            <div class="step-circle">2</div>
                            <div class="step-label">Party Size</div>
                        </div>
                        <div class="booking-step" data-step="3">
                            <div class="step-circle">3</div>
                            <div class="step-label">Details</div>
                        </div>
                        <div class="booking-step" data-step="4">
                            <div class="step-circle">4</div>
                            <div class="step-label">Confirm</div>
                        </div>
                    </div>
                    <div id="bookingStepContent"></div>
                </div>
                <div class="booking-footer">
                    <button class="btn-secondary" id="bookingPrevBtn">Back</button>
                    <button class="btn-primary" id="bookingNextBtn">Continue</button>
                </div>
            </div>
        `;

        modal.querySelector('#closeBooking').addEventListener('click', () => this.close());
        modal.querySelector('#bookingPrevBtn').addEventListener('click', () => this.prevStep());
        modal.querySelector('#bookingNextBtn').addEventListener('click', () => this.nextStep());

        return modal;
    }

    renderStep() {
        const content = document.getElementById('bookingStepContent');
        const steps = document.querySelectorAll('.booking-step');
        
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            if (index + 1 < this.currentStep) {
                step.classList.add('completed');
            } else if (index + 1 === this.currentStep) {
                step.classList.add('active');
            }
        });

        switch(this.currentStep) {
            case 1:
                content.innerHTML = this.renderDateTimeStep();
                this.initDateTimeStep();
                break;
            case 2:
                content.innerHTML = this.renderPartySizeStep();
                this.initPartySizeStep();
                break;
            case 3:
                content.innerHTML = this.renderDetailsStep();
                this.initDetailsStep();
                break;
            case 4:
                content.innerHTML = this.renderConfirmStep();
                break;
        }

        document.getElementById('bookingPrevBtn').style.display = this.currentStep === 1 ? 'none' : 'block';
        document.getElementById('bookingNextBtn').textContent = this.currentStep === 4 ? 'Confirm Booking' : 'Continue';
    }

    renderDateTimeStep() {
        return `
            <h3 class="booking-section-title">Select Date & Time</h3>
            <div class="date-time-grid">
                <div class="date-picker-container">
                    <label class="picker-label">Choose Date</label>
                    <input type="date" class="date-input" id="bookingDate" min="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="time-picker-container">
                    <label class="picker-label">Choose Time</label>
                    <div class="time-slots-grid" id="timeSlots"></div>
                </div>
            </div>
        `;
    }

    initDateTimeStep() {
        const timeSlots = ['5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM'];
        const container = document.getElementById('timeSlots');
        
        timeSlots.forEach(time => {
            const slot = document.createElement('button');
            slot.className = 'time-slot';
            slot.textContent = time;
            slot.addEventListener('click', () => {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                slot.classList.add('selected');
                this.bookingData.time = time;
            });
            container.appendChild(slot);
        });

        document.getElementById('bookingDate').addEventListener('change', (e) => {
            this.bookingData.date = e.target.value;
        });
    }

    renderPartySizeStep() {
        return `
            <h3 class="booking-section-title">Party Size</h3>
            <div class="party-size-selector">
                <button class="party-size-btn" id="decreasePartySize">−</button>
                <div class="party-size-display" id="partySizeDisplay">${this.bookingData.partySize}</div>
                <button class="party-size-btn" id="increasePartySize">+</button>
            </div>
            <div class="party-size-label">Number of guests</div>
        `;
    }

    initPartySizeStep() {
        document.getElementById('decreasePartySize').addEventListener('click', () => {
            if (this.bookingData.partySize > 1) {
                this.bookingData.partySize--;
                document.getElementById('partySizeDisplay').textContent = this.bookingData.partySize;
            }
        });

        document.getElementById('increasePartySize').addEventListener('click', () => {
            if (this.bookingData.partySize < 20) {
                this.bookingData.partySize++;
                document.getElementById('partySizeDisplay').textContent = this.bookingData.partySize;
            }
        });
    }

    renderDetailsStep() {
        return `
            <h3 class="booking-section-title">Special Requests</h3>
            <div class="special-requests-section">
                <label class="picker-label">Occasion (Optional)</label>
                <div class="occasion-chips">
                    <button class="occasion-chip" data-occasion="birthday">Birthday</button>
                    <button class="occasion-chip" data-occasion="anniversary">Anniversary</button>
                    <button class="occasion-chip" data-occasion="date">Date Night</button>
                    <button class="occasion-chip" data-occasion="business">Business</button>
                    <button class="occasion-chip" data-occasion="celebration">Celebration</button>
                </div>
                <label class="picker-label" style="margin-top: 1.5rem;">Additional Requests</label>
                <textarea class="form-textarea" id="specialRequests" placeholder="Any dietary restrictions, seating preferences, or special requests..."></textarea>
            </div>
        `;
    }

    initDetailsStep() {
        document.querySelectorAll('.occasion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.occasion-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                this.bookingData.occasion = chip.dataset.occasion;
            });
        });

        document.getElementById('specialRequests').addEventListener('input', (e) => {
            this.bookingData.specialRequests = e.target.value;
        });
    }

    renderConfirmStep() {
        return `
            <h3 class="booking-section-title">Confirm Your Reservation</h3>
            <div class="booking-summary">
                <div class="summary-row">
                    <span class="summary-label">Restaurant</span>
                    <span class="summary-value">${this.bookingData.venue?.name || 'N/A'}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Date</span>
                    <span class="summary-value">${this.bookingData.date || 'Not selected'}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Time</span>
                    <span class="summary-value">${this.bookingData.time || 'Not selected'}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Party Size</span>
                    <span class="summary-value">${this.bookingData.partySize} guests</span>
                </div>
                ${this.bookingData.occasion ? `
                <div class="summary-row">
                    <span class="summary-label">Occasion</span>
                    <span class="summary-value">${this.bookingData.occasion}</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    nextStep() {
        if (this.currentStep < 4) {
            if (this.validateStep()) {
                this.currentStep++;
                this.renderStep();
            }
        } else {
            this.confirmBooking();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.renderStep();
        }
    }

    validateStep() {
        switch(this.currentStep) {
            case 1:
                if (!this.bookingData.date || !this.bookingData.time) {
                    notify.warning('Missing Information', 'Please select both date and time');
                    return false;
                }
                break;
        }
        return true;
    }

    confirmBooking() {
        // Simulate booking confirmation
        this.close();
        notify.success(
            'Reservation Confirmed!',
            `Your table for ${this.bookingData.partySize} at ${this.bookingData.venue?.name} on ${this.bookingData.date} at ${this.bookingData.time} has been confirmed.`,
            8000
        );
    }

    close() {
        const modal = document.getElementById('bookingModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
}

// Global booking instance
const booking = new BookingManager();

// ===================================
// UTILITY FUNCTIONS
// ===================================

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Format time ago
function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    
    return 'Just now';
}

// Debounce function
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

// Local storage helpers
const storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(key);
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { notify, booking, formatDate, timeAgo, debounce, storage };
}