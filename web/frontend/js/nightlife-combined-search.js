/**
 * Nightlife Combined Search Integration
 * Connects the combined search bar (venue type, music genre, cover charge)
 * with the map and venue listing filters.
 */
(function() {
    'use strict';

    // Wait for DOM
    document.addEventListener('DOMContentLoaded', function() {
        const searchType = document.getElementById('nlSearchType');
        const searchGenre = document.getElementById('nlSearchGenre');
        const searchCover = document.getElementById('nlSearchCover');
        const searchText = document.getElementById('nlSearchText');
        const searchBtn = document.getElementById('nlSearchBtn');

        if (!searchType || !searchGenre || !searchCover || !searchText || !searchBtn) return;

        // Map venue type values to filter button data-type values
        const typeMap = {
            'all': 'all',
            'nightclub': 'Club',
            'bar': 'Bar',
            'cocktail-lounge': 'Lounge',
            'sports-bar': 'Bar',
            'rooftop': 'Bar',
            'live-music': 'Live Music'
        };

        // Map genre values to filter button data-genre values
        const genreMap = {
            'all': 'all',
            'electronic': 'Electronic',
            'hip-hop': 'Hip Hop',
            'jazz': 'Jazz',
            'rock': 'Rock',
            'top-40': 'Top 40',
            'latin': 'Latin',
            'r-and-b': 'R&B'
        };

        // Map cover values to filter button data-price values
        const coverMap = {
            'all': 'all',
            'free': 'free',
            'under20': 'under20',
            'under30': 'under30',
            'under50': 'under30' // fallback to highest available
        };

        function applyFilters() {
            var typeVal = searchType.value;
            var genreVal = searchGenre.value;
            var coverVal = searchCover.value;
            var textVal = searchText.value.trim();

            // 1. Sync with sidebar venue type filter
            var sidebarTypeSelect = document.getElementById('venueTypeFilter');
            if (sidebarTypeSelect) {
                sidebarTypeSelect.value = typeVal;
                sidebarTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 2. Click matching venue type button
            var mappedType = typeMap[typeVal] || 'all';
            var typeButtons = document.querySelectorAll('.venue-type-filter');
            typeButtons.forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-type') === mappedType) {
                    btn.classList.add('active');
                }
            });

            // 3. Click matching genre button
            var mappedGenre = genreMap[genreVal] || 'all';
            var genreButtons = document.querySelectorAll('.music-genre-filter');
            genreButtons.forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-genre') === mappedGenre) {
                    btn.classList.add('active');
                }
            });

            // 4. Click matching cover button
            var mappedCover = coverMap[coverVal] || 'all';
            var priceButtons = document.querySelectorAll('.price-filter');
            priceButtons.forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.getAttribute('data-price') === mappedCover) {
                    btn.classList.add('active');
                }
            });

            // 5. Update search text
            var nightlifeSearchInput = document.getElementById('nightlifeSearch');
            if (nightlifeSearchInput) {
                nightlifeSearchInput.value = textVal;
                nightlifeSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Also update sidebar search input
            var sidebarSearch = document.getElementById('searchInput');
            if (sidebarSearch) {
                sidebarSearch.value = textVal;
                sidebarSearch.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 6. Trigger filtering on the venue cards
            filterVenueCards(mappedType, mappedGenre, mappedCover, textVal);

            // 7. Update map markers based on filters
            updateMapMarkers(mappedType, mappedGenre, mappedCover, textVal);

            // 8. Scroll to results
            var venuesSection = document.querySelector('.venues-section, .nightlife-list-header');
            if (venuesSection) {
                venuesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        function filterVenueCards(type, genre, cover, text) {
            var cards = document.querySelectorAll('.nightlife-venue-card');
            var visibleCount = 0;
            var searchLower = text.toLowerCase();

            cards.forEach(function(card) {
                var show = true;

                // Type filter
                if (type !== 'all') {
                    var cardType = card.querySelector('.venue-type-badge, .nightlife-venue-type');
                    var cardTypeText = cardType ? cardType.textContent.trim().toUpperCase() : '';
                    if (cardTypeText.indexOf(type.toUpperCase()) === -1) {
                        show = false;
                    }
                }

                // Genre filter
                if (show && genre !== 'all') {
                    var genreTags = card.querySelectorAll('.genre-tag, .venue-tag, .music-tag');
                    var hasGenre = false;
                    genreTags.forEach(function(tag) {
                        if (tag.textContent.trim().toLowerCase().indexOf(genre.toLowerCase()) !== -1) {
                            hasGenre = true;
                        }
                    });
                    // Also check card text
                    if (!hasGenre && card.textContent.toLowerCase().indexOf(genre.toLowerCase()) !== -1) {
                        hasGenre = true;
                    }
                    if (!hasGenre) show = false;
                }

                // Cover charge filter
                if (show && cover !== 'all') {
                    var coverText = card.textContent.toLowerCase();
                    if (cover === 'free') {
                        if (coverText.indexOf('no cover') === -1 && coverText.indexOf('free') === -1) {
                            show = false;
                        }
                    } else if (cover === 'under20') {
                        var coverMatch = coverText.match(/\$(\d+)\s*cover/);
                        if (coverMatch && parseInt(coverMatch[1]) >= 20) {
                            show = false;
                        }
                    } else if (cover === 'under30') {
                        var coverMatch2 = coverText.match(/\$(\d+)\s*cover/);
                        if (coverMatch2 && parseInt(coverMatch2[1]) >= 30) {
                            show = false;
                        }
                    }
                }

                // Text search
                if (show && searchLower) {
                    if (card.textContent.toLowerCase().indexOf(searchLower) === -1) {
                        show = false;
                    }
                }

                card.style.display = show ? '' : 'none';
                if (show) visibleCount++;
            });

            // Update count
            var countEl = document.getElementById('nightlifeCount');
            if (countEl) {
                countEl.textContent = visibleCount + ' venues found';
            }
        }

        function updateMapMarkers(type, genre, cover, text) {
            // Try to access the map through various global references
            var mapInstance = window.nightlifeMap || window.nlMap;
            if (!mapInstance) return;

            // If there are marker objects, filter visibility
            var markers = window.nightlifeMarkers || window.nlMarkers || [];
            if (markers.length === 0) return;

            markers.forEach(function(marker) {
                if (!marker || !marker.data) return;
                var show = true;
                var data = marker.data;

                if (type !== 'all' && data.type) {
                    if (data.type.toUpperCase().indexOf(type.toUpperCase()) === -1) {
                        show = false;
                    }
                }

                if (show && genre !== 'all' && data.genre) {
                    var genreStr = Array.isArray(data.genre) ? data.genre.join(' ') : data.genre;
                    if (genreStr.toLowerCase().indexOf(genre.toLowerCase()) === -1) {
                        show = false;
                    }
                }

                if (show && text) {
                    var markerText = (data.name || '') + ' ' + (data.neighborhood || '') + ' ' + (data.type || '');
                    if (markerText.toLowerCase().indexOf(text.toLowerCase()) === -1) {
                        show = false;
                    }
                }

                if (marker.setVisible) {
                    marker.setVisible(show);
                } else if (marker.setOpacity) {
                    marker.setOpacity(show ? 1 : 0);
                } else if (marker._icon) {
                    marker._icon.style.display = show ? '' : 'none';
                }
            });
        }

        // Event listeners
        searchBtn.addEventListener('click', applyFilters);

        searchText.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
            }
        });

        // Live filter on dropdown change
        searchType.addEventListener('change', applyFilters);
        searchGenre.addEventListener('change', applyFilters);
        searchCover.addEventListener('change', applyFilters);
    });
})();