/**
 * SceneLink Lists Integration
 * Cross-page integration for the Lists system
 * Works with events, nightlife, tonight, and explore pages
 * Uses event delegation for robust button interception
 */
(function() {
    'use strict';

    // Wait for SceneLinkLists to be available
    function waitForLists(callback, maxWait) {
        maxWait = maxWait || 5000;
        const start = Date.now();
        function check() {
            if (window.SceneLinkLists) {
                callback();
            } else if (Date.now() - start < maxWait) {
                setTimeout(check, 100);
            }
        }
        check();
    }

    function detectPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop().replace('.html', '');
        if (filename.includes('event')) return 'events';
        if (filename.includes('nightlife')) return 'nightlife';
        if (filename.includes('tonight')) return 'tonight';
        if (filename.includes('explore')) return 'explore';
        if (filename.includes('profile')) return 'profile';
        if (filename.includes('social')) return 'social';
        return filename;
    }

    waitForLists(function() {
        const page = detectPage();

        switch (page) {
            case 'events': integrateEvents(); break;
            case 'nightlife': integrateNightlife(); break;
            case 'tonight': integrateTonight(); break;
            case 'explore': integrateExplore(); break;
            case 'profile': integrateProfile(); break;
        }
    });

    // ==========================================
    // EVENTS PAGE INTEGRATION
    // ==========================================
    function integrateEvents() {
        // Use event delegation to intercept save button clicks on event cards
        document.body.addEventListener('click', function(e) {
            // Check for the heart/save button: data-action="save" on .sl-card-btn
            const saveBtn = e.target.closest('[data-action="save"]');
            if (saveBtn) {
                const card = saveBtn.closest('.sl-event-card, .sl-featured-event');
                if (card) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const item = extractEventData(card);
                    window.SceneLinkLists.showSaveToList(item);
                    return;
                }
            }
        }, true); // useCapture for priority

        // Enhance save buttons with bookmark icon (icon only, no text)
        function enhanceSaveButtons() {
            document.querySelectorAll('.sl-event-card [data-action="save"], .sl-featured-event [data-action="save"]').forEach(btn => {
                if (!btn.dataset.listsEnhanced) {
                    btn.dataset.listsEnhanced = 'true';
                    // Change heart icon to bookmark icon, keep icon only
                    btn.innerHTML = '<i class="fas fa-bookmark"></i>';
                    btn.title = 'Save to List';
                }
            });
        }

        // Run enhancement immediately and observe for dynamically added cards
        enhanceSaveButtons();
        const observer = new MutationObserver(function() {
            enhanceSaveButtons();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function extractEventData(card) {
        const name = card.querySelector('.sl-card-title, h3, h2')?.textContent?.trim() || 'Unknown Event';
        const venueTime = card.querySelector('.sl-card-venue-time');
        const venue = venueTime?.querySelector('span:first-child')?.textContent?.trim()?.replace(/^\s*/, '') || '';
        const time = venueTime?.querySelector('span:last-child')?.textContent?.trim()?.replace(/^\s*/, '') || '';
        const img = card.querySelector('img')?.src || '';
        const category = card.querySelector('.sl-card-category-icon')?.textContent?.trim() || '';
        const badge = card.querySelector('.sl-badge')?.textContent?.trim() || '';
        const engSpans = card.querySelectorAll('.sl-card-engagement span');
        const attending = engSpans[0]?.textContent?.trim() || '';
        const rating = engSpans[1]?.textContent?.trim() || '';

        return {
            id: 'event-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: name,
            type: category || 'Event',
            location: venue.replace(/^[\s\u200b]*/, ''),
            time: time.replace(/^[\s\u200b]*/, ''),
            image: img,
            rating: parseFloat(rating) || 0,
            tags: badge ? [badge] : [],
            source: 'events'
        };
    }

    // ==========================================
    // NIGHTLIFE PAGE INTEGRATION
    // ==========================================
    function integrateNightlife() {
        // Add "Save" buttons to each nightlife venue card
        function addListButtons() {
            document.querySelectorAll('.nightlife-venue-card').forEach(function(card) {
                var actions = card.querySelector('.venue-actions');
                if (actions && !actions.querySelector('.sl-list-btn')) {
                    var btn = document.createElement('button');
                    btn.className = 'sl-list-btn btn-share';
                    btn.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                    btn.title = 'Save to List';
                    btn.style.cssText = 'cursor:pointer;';
                    actions.appendChild(btn);
                }
            });
        }

        // Run immediately and watch for dynamically added cards
        addListButtons();
        var observer = new MutationObserver(addListButtons);
        observer.observe(document.body, { childList: true, subtree: true });

        // Use event delegation to intercept List button clicks
        document.body.addEventListener('click', function(e) {
            var listBtn = e.target.closest('.sl-list-btn');
            if (listBtn && listBtn.closest('.nightlife-venue-card')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                var card = listBtn.closest('.nightlife-venue-card');
                if (card) {
                    var item = extractNightlifeData(card);
                    window.SceneLinkLists.showSaveToList(item);
                }
                return;
            }

            // Also intercept the save button in venue details modal
            var modalSaveBtn = e.target.closest('.modal-save-btn, [data-action="save-to-list"]');
            if (modalSaveBtn) {
                e.preventDefault();
                e.stopPropagation();
                var modal = modalSaveBtn.closest('.venue-modal, .modal, [class*="modal"]');
                if (modal) {
                    var name = modal.querySelector('h2, h3, .venue-name, .modal-title')?.textContent?.trim() || 'Unknown Venue';
                    var item = {
                        id: 'nightlife-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        name: name,
                        type: 'Nightlife',
                        source: 'nightlife'
                    };
                    window.SceneLinkLists.showSaveToList(item);
                }
                return;
            }
        }, true);
    }

    function extractNightlifeData(card) {
        const name = card.querySelector('.venue-name, h3, h2')?.textContent?.trim() || 'Unknown Venue';
        const address = card.querySelector('.venue-address, .venue-location')?.textContent?.trim() || '';
        const rating = card.querySelector('.venue-rating, .rating')?.textContent?.trim() || '';
        const img = card.querySelector('img')?.src || '';
        const type = card.querySelector('.venue-type-badge, .venue-type, .type-badge')?.textContent?.trim() || 'Venue';
        const desc = card.querySelector('.venue-description, .venue-desc, p')?.textContent?.trim() || '';

        return {
            id: 'nightlife-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: name,
            type: type || 'Nightlife',
            location: address,
            description: desc,
            image: img,
            rating: parseFloat(rating) || 0,
            source: 'nightlife'
        };
    }

    // ==========================================
    // TONIGHT'S PICKS PAGE INTEGRATION
    // ==========================================
    function integrateTonight() {
        // Tonight page has .tp-card-save buttons (bookmark icons) on .tp-venue-card cards
        // Use event delegation to intercept bookmark button clicks

        document.body.addEventListener('click', function(e) {
            const saveBtn = e.target.closest('.tp-card-save');
            if (saveBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const card = saveBtn.closest('.tp-venue-card, .tp-featured-card');
                if (card) {
                    const item = extractTonightData(card);
                    window.SceneLinkLists.showSaveToList(item);
                }
                return;
            }
        }, true); // useCapture for priority

        // Also enhance the featured card's share button area
        enhanceFeaturedCard();
    }

    function enhanceFeaturedCard() {
        const featured = document.querySelector('.tp-featured-card');
        if (featured) {
            const footer = featured.querySelector('.tp-featured-footer');
            if (footer && !footer.querySelector('.tp-list-btn')) {
                const btn = document.createElement('button');
                btn.className = 'tp-btn-icon tp-list-btn';
                btn.innerHTML = '<i class="fas fa-bookmark"></i>';
                btn.title = 'Save to List';
                btn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = extractTonightData(featured);
                    window.SceneLinkLists.showSaveToList(item);
                };
                footer.appendChild(btn);
            }
        }
    }

    function extractTonightData(card) {
        const name = card.querySelector('.tp-venue-name, h3, h2')?.textContent?.trim() || 'Unknown Venue';
        const type = card.querySelector('.tp-venue-type, .tp-featured-type')?.textContent?.trim() || '';
        const desc = card.querySelector('.tp-venue-desc, .tp-featured-desc, p')?.textContent?.trim() || '';
        const meta = card.querySelector('.tp-venue-meta, .tp-featured-meta');
        const rating = card.querySelector('.tp-venue-rating, .tp-featured-rating')?.textContent?.trim() || '';
        const img = card.querySelector('img')?.src || '';
        const tags = [];
        card.querySelectorAll('.tp-venue-tag, .tp-tag, .tp-featured-tag').forEach(t => {
            tags.push(t.textContent.trim());
        });

        // Get hours and location from meta
        let location = '';
        let time = '';
        if (meta) {
            const spans = meta.querySelectorAll('span');
            spans.forEach(s => {
                const text = s.textContent.trim();
                if (text.includes('PM') || text.includes('AM')) {
                    time = text;
                } else if (text.includes('mi') || text.includes('End') || text.includes('Bay') || text.includes('Downtown')) {
                    location = text;
                }
            });
        }

        return {
            id: 'tonight-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: name,
            type: type || 'Tonight\'s Pick',
            location: location,
            time: time,
            description: desc,
            image: img,
            rating: parseFloat(rating) || 0,
            tags: tags,
            source: 'tonight'
        };
    }

    // ==========================================
    // EXPLORE PAGE INTEGRATION
    // ==========================================
    function integrateExplore() {
        // Explore page has .venue-save-btn (heart buttons) on .venue-card cards
        // Use event delegation with useCapture to intercept before other handlers

        document.body.addEventListener('click', function(e) {
            // Check for heart/save button
            const saveBtn = e.target.closest('.venue-save-btn');
            if (saveBtn) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const card = saveBtn.closest('.venue-card');
                if (card) {
                    const item = extractExploreData(card);
                    window.SceneLinkLists.showSaveToList(item);
                }
                return;
            }

            // Also intercept save button in the venue details modal
            const modalSave = e.target.closest('#venueDetailsModal .modal-save-btn') || e.target.closest('#venueDetailsModal .venue-detail-save');
            if (modalSave) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const modal = document.getElementById('venueDetailsModal');
                if (modal) {
                    const name = modal.querySelector('h2')?.textContent?.trim() || 'Unknown Venue';
                    const venueId = modalSave.getAttribute('data-venue-id') || '';
                    const typeEl = modal.querySelector('[style*="text-transform:uppercase"]');
                    const type = typeEl ? typeEl.textContent.trim() : 'Venue';
                    const ratingEl = modal.querySelector('[style*="color:#D4AF37"][style*="font-size:16px"]');
                    const rating = ratingEl ? ratingEl.textContent.trim().replace('★ ', '') : '';
                    const imgEl = modal.querySelector('img');
                    const img = imgEl ? imgEl.src : '';
                    const item = {
                        id: venueId ? 'explore-' + venueId : 'explore-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        name: name,
                        type: type,
                        rating: rating,
                        image: img,
                        source: 'explore'
                    };
                    window.SceneLinkLists.showSaveToList(item);
                }
                return;
            }
        }, true); // useCapture = true for priority
    }

    function extractExploreData(card) {
        const name = card.querySelector('.venue-name, h3, h4')?.textContent?.trim() || 'Unknown Venue';
        const type = card.querySelector('.venue-type')?.textContent?.trim() || '';
        const neighborhood = card.querySelector('.venue-neighborhood')?.textContent?.trim() || '';
        const rating = card.querySelector('.venue-rating')?.textContent?.trim() || '';
        const desc = card.querySelector('.venue-highlight, .venue-description, p')?.textContent?.trim() || '';
        const img = card.querySelector('img')?.src || '';
        const price = card.querySelector('.venue-price')?.textContent?.trim() || '';
        const tags = [];
        card.querySelectorAll('.venue-tag').forEach(t => {
            tags.push(t.textContent.trim());
        });

        return {
            id: 'explore-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: name,
            type: type || 'Venue',
            location: neighborhood,
            description: desc,
            image: img,
            rating: parseFloat(rating) || 0,
            price: price,
            tags: tags,
            source: 'explore'
        };
    }

    // ==========================================
    // PROFILE PAGE INTEGRATION
    // ==========================================
    function integrateProfile() {
        var lists = window.SceneLinkLists.getLists();

        // 1. Populate the Lists tab grid with live data
        var tabGrid = document.getElementById('profileListsGrid');
        if (tabGrid) {
            tabGrid.innerHTML = lists.map(function(list) {
                var previewImages = list.items.filter(function(i) { return i.image; }).slice(0, 3);
                return '<div class="list-card" style="cursor:pointer;" onclick="window.SceneLinkLists.showListDetail(\'' + list.id + '\')">' +
                    '<div class="list-header">' +
                        '<h4>' + list.emoji + ' ' + list.name + '</h4>' +
                        '<span class="list-count">' + list.items.length + ' venues</span>' +
                    '</div>' +
                    (previewImages.length > 0 ?
                        '<div class="list-preview">' +
                        previewImages.map(function(i) { return '<img src="' + i.image + '" alt="' + i.name + '">'; }).join('') +
                        '</div>' : '') +
                    '<p class="list-description">' + (list.description || 'No description') + '</p>' +
                    '<div class="list-stats">' +
                        '<span><i class="fas fa-map-marker-alt"></i> ' + list.items.length + ' places</span>' +
                        '<span><i class="fas fa-' + (list.privacy === 'public' ? 'globe' : 'lock') + '"></i> ' + (list.privacy === 'public' ? 'Public' : 'Private') + '</span>' +
                    '</div>' +
                '</div>';
            }).join('');

            // Add a "View All / Create" footer row
            tabGrid.insertAdjacentHTML('beforeend',
                '<div style="grid-column:1/-1;display:flex;justify-content:center;gap:12px;padding:16px 0;">' +
                    '<a href="my-lists.html" style="color:#D4AF37;text-decoration:none;font-size:0.9rem;padding:8px 20px;border:1px solid rgba(212,175,55,0.3);border-radius:8px;">View All Lists →</a>' +
                    '<button onclick="window.SceneLinkLists.showCreateModal()" style="background:#D4AF37;color:#000;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;">✨ New List</button>' +
                '</div>'
            );
        }
    }

})();