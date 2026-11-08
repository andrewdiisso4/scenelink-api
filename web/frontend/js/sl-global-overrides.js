/* ============================================
   SceneLink Global Overrides JS v3
   Pin animations, saves/lists (object-based),
   detail panel, social activity, cross-page connectivity
   ============================================ */
(function() {
    'use strict';

    // ============ SAVES & LISTS SYSTEM (Object-based) ============
    window.SLLists = {
        KEY: 'sl_saved_venues',
        
        getSaved: function() {
            try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
            catch(e) { return {}; }
        },
        
        isSaved: function(venueId) {
            var saved = this.getSaved();
            return !!saved[venueId];
        },
        
        toggleSave: function(venueId, venueData) {
            var saved = this.getSaved();
            var wasSaved = !!saved[venueId];
            if (wasSaved) {
                delete saved[venueId];
                this.showToast('Removed from saved');
            } else {
                saved[venueId] = {
                    list: 'favorites',
                    name: (venueData && venueData.name) || 'Venue',
                    type: (venueData && venueData.type) || '',
                    rating: (venueData && venueData.rating) || '',
                    img: (venueData && venueData.img) || '',
                    area: (venueData && venueData.area) || '',
                    time: Date.now()
                };
                this.showToast('Saved to Favorites ❤️');
            }
            localStorage.setItem(this.KEY, JSON.stringify(saved));
            // Sync the window cache used by explore/nightlife engines
            window._slSavedVenues = saved;
            this.updateAllButtons(venueId);
            window.dispatchEvent(new Event('sl-lists-changed'));
            // Track social activity
            if (window.SLSocial) {
                window.SLSocial.log(wasSaved ? 'unsave' : 'save', venueId, venueData);
            }
            return !wasSaved;
        },
        
        updateAllButtons: function(venueId) {
            var isSaved = this.isSaved(venueId);
            document.querySelectorAll('[data-save-id="' + venueId + '"]').forEach(function(btn) {
                btn.classList.toggle('saved', isSaved);
                var icon = btn.querySelector('i');
                if (icon) {
                    icon.className = isSaved ? 'fas fa-heart' : 'far fa-heart';
                }
            });
        },
        
        showToast: function(msg) {
            var existing = document.querySelector('.sl-toast');
            if (existing) existing.remove();
            var toast = document.createElement('div');
            toast.className = 'sl-toast';
            toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + msg;
            toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
                'background:rgba(212,175,55,0.95);color:#000;padding:12px 24px;border-radius:10px;' +
                'font-size:14px;font-weight:600;z-index:99999;display:flex;align-items:center;gap:8px;' +
                'box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:sl-toast-in 0.3s ease;';
            document.body.appendChild(toast);
            setTimeout(function() {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(function() { toast.remove(); }, 300);
            }, 2500);
        }
    };

    // ============ SOCIAL ACTIVITY TRACKER ============
    window.SLSocial = {
        KEY: 'sl_social_activity',
        MAX: 100,

        log: function(action, venueId, data) {
            var activity = this.getAll();
            activity.unshift({
                action: action,
                venueId: venueId,
                name: (data && data.name) || venueId,
                type: (data && data.type) || '',
                timestamp: Date.now(),
                page: window.location.pathname.split('/').pop() || 'index.html'
            });
            // Keep only recent entries
            if (activity.length > this.MAX) activity = activity.slice(0, this.MAX);
            localStorage.setItem(this.KEY, JSON.stringify(activity));
            window.dispatchEvent(new CustomEvent('sl-social-activity', { detail: { action: action, venueId: venueId } }));
        },

        getAll: function() {
            try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
            catch(e) { return []; }
        },

        getRecent: function(count) {
            return this.getAll().slice(0, count || 10);
        }
    };

    // ============ PIN ANIMATIONS ============
    function initPinAnimations() {
        var pins = document.querySelectorAll('.sl-pin-animate');
        if (!pins.length) return;

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var pin = entry.target;
                    var delay = parseInt(pin.getAttribute('data-delay') || '0', 10);
                    setTimeout(function() {
                        pin.classList.add('sl-pin-visible');
                    }, delay);
                    observer.unobserve(pin);
                }
            });
        }, { threshold: 0.3 });

        pins.forEach(function(pin) {
            observer.observe(pin);
        });
    }

    // ============ DETAIL PANEL (RIGHT-SIDE SLIDE) ============
    function initDetailPanel() {
        // Close on overlay click
        document.addEventListener('click', function(e) {
            var overlay = e.target.closest('.sl-detail-overlay');
            if (overlay && e.target === overlay) {
                overlay.classList.remove('active');
            }
            if (e.target.closest('.sl-detail-close')) {
                var panel = e.target.closest('.sl-detail-overlay') || document.getElementById('slDetailOverlay');
                if (panel) panel.classList.remove('active');
            }
        });

        // ESC to close
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.sl-detail-overlay.active').forEach(function(o) {
                    o.classList.remove('active');
                });
            }
        });
    }

    // ============ REMOVE UNWANTED ELEMENTS ============
    function removeUnwanted() {
        var sels = ['[class*="ninja"]', '#ninja-badge', '.made-by-ninja', '.ninja-daytona',
            'script[src*="ninja-daytona"]', 'script[src*="enhanced-deployment"]'];
        sels.forEach(function(sel) {
            try {
                document.querySelectorAll(sel).forEach(function(el) {
                    if (el.closest && (el.closest('.site-header') || el.closest('nav'))) return;
                    el.remove();
                });
            } catch(e) {}
        });
    }

    // ============ SMOOTH SCROLL ============
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                var target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    // ============ HEADER SCROLL ============
    function initHeaderScroll() {
        var header = document.querySelector('.header-enhanced, .site-header, header');
        if (!header) return;
        var ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                requestAnimationFrame(function() {
                    header.classList.toggle('header-scrolled', window.scrollY > 50);
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // ============ ACTIVE NAV ============
    function initActiveNav() {
        var page = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-link').forEach(function(link) {
            var href = link.getAttribute('href');
            if (href === page || (page === '' && href === 'index.html')) {
                link.classList.add('active');
            }
        });
    }

    // ============ FOOTER YEAR ============
    function updateYear() {
        document.querySelectorAll('.footer-copyright').forEach(function(el) {
            el.innerHTML = el.innerHTML.replace(/\d{4}/, new Date().getFullYear());
        });
    }

    // ============ KEYBOARD SHORTCUTS ============
    function initKeyboard() {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active, .sl-auth-overlay.active, .sl-detail-overlay.active, .tp-modal-overlay.active, .biz-login-overlay.active, .create-list-modal.active').forEach(function(m) {
                    m.classList.remove('active');
                });
                document.body.style.overflow = '';
            }
        });
    }

    // ============ LAZY IMAGE LOADING ============
    function initLazyImages() {
        if ('IntersectionObserver' in window) {
            var imgObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        var img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                        }
                        imgObserver.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });

            document.querySelectorAll('img[data-src]').forEach(function(img) {
                imgObserver.observe(img);
            });
        }
    }

    // ============ SYNC SAVED VENUES CACHE ============
    function syncSavedCache() {
        // Ensure window._slSavedVenues is in sync with localStorage
        window._slSavedVenues = SLLists.getSaved();
    }

    // ============ TOAST CSS INJECTION ============
    function injectToastCSS() {
        if (document.getElementById('sl-toast-css')) return;
        var style = document.createElement('style');
        style.id = 'sl-toast-css';
        style.textContent = '@keyframes sl-toast-in{from{opacity:0;transform:translateX(-50%) translateY(20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}' +
            '@keyframes fadeIn{from{opacity:0}to{opacity:1}}';
        document.head.appendChild(style);
    }

    // ============ INIT ============
    function init() {
        injectToastCSS();
        syncSavedCache();
        initPinAnimations();
        removeUnwanted();
        initSmoothScroll();
        initHeaderScroll();
        initActiveNav();
        updateYear();
        initKeyboard();
        initDetailPanel();
        initLazyImages();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('load', function() {
        setTimeout(removeUnwanted, 500);
    });

    // Listen for cross-tab storage changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'sl_saved_venues') {
            syncSavedCache();
        }
    });
})();