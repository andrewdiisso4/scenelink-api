/**
 * SceneLink — Round 9 Updates (Phase 5D-B)
 *
 * The legacy version of this file contained a hardcoded venueDatabase
 * (The Modern Bistro, Trattoria Milano, Sushi Haven, Skyline Rooftop,
 * The Velvet Lounge, etc.) that intercepted the homepage search input and
 * rendered fake suggestion dropdown items. The real, live API-backed
 * homepage search is in `round9-3d-homepage.js` (Phase 5D-A) using
 * `/api/venues?q=...`.
 *
 * This file is reduced to just the non-search UI behaviors that the
 * homepage still relies on:
 *   - Discovery card heart-toggle interaction
 *   - "Explore Now" city dropdown toggle
 *
 * Zero hardcoded venue/people names. No mock data.
 */
document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // ===== DISCOVERY CARD INTERACTIONS =====
    document.querySelectorAll('.dc-action-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var icon = this.querySelector('i');
            if (icon && icon.classList.contains('fa-heart')) {
                this.classList.toggle('liked');
                if (this.classList.contains('liked')) {
                    icon.style.color = '#ef4444';
                    var n1 = parseInt((this.textContent.match(/\d+/) || [0])[0]);
                    this.innerHTML = '<i class="fas fa-heart" style="color:#ef4444"></i> ' + (n1 + 1);
                } else {
                    icon.style.color = '';
                    var n2 = parseInt((this.textContent.match(/\d+/) || [0])[0]);
                    this.innerHTML = '<i class="fas fa-heart"></i> ' + Math.max(0, n2 - 1);
                }
            }
        });
    });

    // ===== EXPLORE NOW DROPDOWN FIX =====
    var exploreBtn = document.querySelector('.btn-explore-now');
    var cityDropdown = document.querySelector('.city-dropdown');
    if (exploreBtn && cityDropdown) {
        exploreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            cityDropdown.classList.toggle('show');
        });
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.explore-dropdown-wrapper')) {
                cityDropdown.classList.remove('show');
            }
        });
    }
});
