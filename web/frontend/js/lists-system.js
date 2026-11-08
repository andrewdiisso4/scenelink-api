/**
 * SceneLink Lists System v3 - Modern Clean Design
 * Full CRUD with localStorage, undo-remove, Plan Night Out, improved UX
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'scenelink_lists';
    const TOAST_DURATION = 2500;
    const UNDO_DURATION = 4000;

    // ============================================
    // DATA LAYER
    // ============================================

    function generateId() {
        return 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function getLists() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : getDefaultLists();
        } catch (e) {
            return getDefaultLists();
        }
    }

    function saveLists(lists) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    }

    function getDefaultLists() {
        // Phase 5D-B: default seeded lists removed (were fake "Date Night Spots",
        // "Weekend Brunch", "Must-Try Restaurants", "Friday Night Plan" with hardcoded
        // Neptune Oyster / Oleana / Bella Vista / Toro items). New users start empty.
        return [];
    }

    // ============================================
    // CRUD OPERATIONS
    // ============================================

    function createList(data) {
        const lists = getLists();
        const newList = {
            id: generateId(),
            name: data.name || 'Untitled List',
            description: data.description || '',
            emoji: data.emoji || '📋',
            privacy: data.privacy || 'private',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: data.tags || [],
            items: []
        };
        lists.unshift(newList);
        saveLists(lists);
        showToast('List created! ✨');
        return newList;
    }

    function updateList(listId, data) {
        const lists = getLists();
        const idx = lists.findIndex(l => l.id === listId);
        if (idx === -1) return null;
        Object.assign(lists[idx], data, { updatedAt: new Date().toISOString() });
        saveLists(lists);
        showToast('List updated! ✅');
        return lists[idx];
    }

    function deleteList(listId) {
        let lists = getLists();
        lists = lists.filter(l => l.id !== listId);
        saveLists(lists);
        showToast('List deleted');
    }

    function addItemToList(listId, item) {
        const lists = getLists();
        const list = lists.find(l => l.id === listId);
        if (!list) return;

        const exists = list.items.some(i => i.name === item.name && i.type === item.type);
        if (exists) {
            showToast('Already in this list');
            return;
        }

        list.items.push({
            id: 'item_' + Date.now(),
            name: item.name,
            type: item.type || '',
            neighborhood: item.neighborhood || '',
            rating: item.rating || 0,
            price: item.price || '',
            image: item.image || '',
            source: item.source || 'manual',
            addedAt: new Date().toISOString()
        });
        list.updatedAt = new Date().toISOString();
        saveLists(lists);
        showToast('Added to "' + list.name + '" ✨');
    }

    function removeItemFromList(listId, itemId) {
        const lists = getLists();
        const list = lists.find(l => l.id === listId);
        if (!list) return;
        list.items = list.items.filter(i => i.id !== itemId);
        list.updatedAt = new Date().toISOString();
        saveLists(lists);
    }

    // ============================================
    // UI COMPONENTS
    // ============================================

    function showToast(message, undoCallback) {
        const existing = document.querySelector('.lists-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'lists-toast' + (undoCallback ? ' with-undo' : '');

        if (undoCallback) {
            toast.innerHTML = '<span>' + message + '</span><button class="toast-undo-btn">Undo</button>';
            toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
                undoCallback();
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 200);
            });
        } else {
            toast.textContent = message;
        }

        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        const dur = undoCallback ? UNDO_DURATION : TOAST_DURATION;
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 200);
        }, dur);
    }

    // Save-to-List dropdown (used across all pages)
    function showSaveToListDropdown(item) {
        const existing = document.querySelector('.save-to-list-backdrop');
        if (existing) existing.remove();
        const existingDropdown = document.querySelector('.save-to-list-dropdown');
        if (existingDropdown) existingDropdown.remove();

        const lists = getLists();

        const backdrop = document.createElement('div');
        backdrop.className = 'save-to-list-backdrop active';
        document.body.appendChild(backdrop);

        const dropdown = document.createElement('div');
        dropdown.className = 'save-to-list-dropdown active';
        dropdown.innerHTML = '<h3>Save to List<button class="save-to-list-close">\u2715</button></h3>' +
            '<div class="save-to-list-items">' +
            lists.map(function(list) {
                var isInList = list.items.some(function(i) { return i.name === item.name; });
                return '<div class="save-to-list-item ' + (isInList ? 'selected' : '') + '" data-list-id="' + list.id + '">' +
                    '<span class="emoji">' + list.emoji + '</span>' +
                    '<span class="name">' + list.name + '</span>' +
                    '<span class="count">' + list.items.length + '</span>' +
                    '<span class="check">\u2713</span></div>';
            }).join('') +
            '</div>' +
            '<div class="save-to-list-new" id="saveToListNew">+ Create New List</div>';
        document.body.appendChild(dropdown);

        var closeDropdown = function() {
            backdrop.remove();
            dropdown.remove();
        };

        backdrop.onclick = closeDropdown;
        dropdown.querySelector('.save-to-list-close').onclick = closeDropdown;

        dropdown.querySelectorAll('.save-to-list-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var listId = el.dataset.listId;
                var isSelected = el.classList.contains('selected');

                if (isSelected) {
                    var currentLists = getLists();
                    var list = currentLists.find(function(l) { return l.id === listId; });
                    if (list) {
                        var existingItem = list.items.find(function(i) { return i.name === item.name; });
                        if (existingItem) {
                            removeItemFromList(listId, existingItem.id);
                            showToast('Removed from list');
                        }
                    }
                    el.classList.remove('selected');
                } else {
                    addItemToList(listId, item);
                    el.classList.add('selected');
                }
            });
        });

        document.getElementById('saveToListNew').addEventListener('click', function() {
            closeDropdown();
            showCreateListModal(function(newList) {
                addItemToList(newList.id, item);
            });
        });
    }

    // Create/Edit List Modal
    function showCreateListModal(callback, editList) {
        var existing = document.querySelector('.lists-modal-overlay');
        if (existing) existing.remove();

        var emojis = ['📋', '💕', '🎉', '🍽️', '🌙', '🎵', '🍸', '⭐', '🔥', '🎯', '🌟', '👥', '🗺️', '🎪', '🏖️', '🎭'];
        var selectedEmoji = editList ? editList.emoji : '📋';

        var overlay = document.createElement('div');
        overlay.className = 'lists-modal-overlay';
        overlay.innerHTML = '<div class="lists-modal">' +
            '<div class="lists-modal-header"><h2>' + (editList ? 'Edit List' : 'Create New List') + '</h2><button class="lists-modal-close">\u2715</button></div>' +
            '<div class="lists-modal-body">' +
                '<div class="lists-form-group"><label>Icon</label><div class="lists-emoji-picker">' +
                emojis.map(function(e) { return '<div class="lists-emoji-option ' + (e === selectedEmoji ? 'selected' : '') + '" data-emoji="' + e + '">' + e + '</div>'; }).join('') +
                '</div></div>' +
                '<div class="lists-form-group"><label>List Name</label><input type="text" id="listNameInput" placeholder="e.g., Date Night Spots" value="' + (editList ? editList.name : '') + '" maxlength="50"></div>' +
                '<div class="lists-form-group"><label>Description</label><textarea id="listDescInput" placeholder="What\'s this list about?" maxlength="200">' + (editList ? editList.description : '') + '</textarea></div>' +
                '<div class="lists-form-group"><label>Privacy</label><select id="listPrivacyInput"><option value="private" ' + (editList && editList.privacy === 'private' ? 'selected' : '') + '>🔒 Private - Only you</option><option value="public" ' + (editList && editList.privacy === 'public' ? 'selected' : '') + '>🌐 Public - Visible to friends</option></select></div>' +
                '<div class="lists-form-group"><label>Tags (comma separated)</label><input type="text" id="listTagsInput" placeholder="e.g., Romantic, Dinner, Cocktails" value="' + (editList ? editList.tags.join(', ') : '') + '"></div>' +
            '</div>' +
            '<div class="lists-modal-footer"><button class="btn-modal-secondary lists-modal-cancel">Cancel</button><button class="btn-modal-primary" id="listSaveBtn">' + (editList ? 'Save Changes' : 'Create List') + '</button></div>' +
        '</div>';

        document.body.appendChild(overlay);
        requestAnimationFrame(function() { overlay.classList.add('active'); });

        var currentEmoji = selectedEmoji;

        overlay.querySelectorAll('.lists-emoji-option').forEach(function(el) {
            el.addEventListener('click', function() {
                overlay.querySelectorAll('.lists-emoji-option').forEach(function(e) { e.classList.remove('selected'); });
                el.classList.add('selected');
                currentEmoji = el.dataset.emoji;
            });
        });

        var closeModal = function() {
            overlay.classList.remove('active');
            setTimeout(function() { overlay.remove(); }, 200);
        };

        overlay.querySelector('.lists-modal-close').addEventListener('click', closeModal);
        overlay.querySelector('.lists-modal-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });

        document.getElementById('listSaveBtn').addEventListener('click', function() {
            var name = document.getElementById('listNameInput').value.trim();
            if (!name) {
                document.getElementById('listNameInput').style.borderColor = '#f87171';
                return;
            }

            var data = {
                name: name,
                description: document.getElementById('listDescInput').value.trim(),
                emoji: currentEmoji,
                privacy: document.getElementById('listPrivacyInput').value,
                tags: document.getElementById('listTagsInput').value.split(',').map(function(t) { return t.trim(); }).filter(Boolean)
            };

            var result;
            if (editList) {
                result = updateList(editList.id, data);
            } else {
                result = createList(data);
            }

            closeModal();
            if (callback) callback(result);
            if (window.renderListsPage) window.renderListsPage();
        });
    }

    // Share list functionality
    function shareList(list) {
        var shareText = 'Check out my SceneLink list "' + list.name + '" - ' + list.items.length + ' amazing spots! 🎉';

        if (navigator.share) {
            navigator.share({
                title: list.name + ' - SceneLink List',
                text: shareText,
                url: window.location.origin + '/my-lists.html'
            }).catch(function() {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText);
            showToast('Link copied to clipboard! 📋');
        }
    }

    // ============================================
    // PLAN NIGHT OUT
    // ============================================

    function showPlanNightOut(list) {
        var existing = document.querySelector('.plan-night-overlay');
        if (existing) existing.remove();

        var friends = [];

        var overlay = document.createElement('div');
        overlay.className = 'plan-night-overlay';

        var venuesHtml = list.items.map(function(item, i) {
            return '<div class="plan-night-venue">' +
                '<div class="plan-night-venue-order">' + (i + 1) + '</div>' +
                '<span class="plan-night-venue-name">' + item.name + '</span>' +
                '<span class="plan-night-venue-type">' + item.type + '</span>' +
            '</div>';
        }).join('');

        overlay.innerHTML = '<div class="plan-night-modal">' +
            '<div class="plan-night-header"><h2>🗓️ Plan Night Out</h2><button class="plan-night-close">\u2715</button></div>' +
            '<div class="plan-night-body">' +
                '<div class="plan-night-section"><label>List</label><div style="color:#fff;font-size:15px;font-weight:600;">' + list.emoji + ' ' + list.name + '</div></div>' +
                '<div class="plan-night-section"><label>Date & Time</label><input type="datetime-local" id="planDateTime"></div>' +
                '<div class="plan-night-section"><label>Itinerary (' + list.items.length + ' stops)</label><div class="plan-night-venues">' + venuesHtml + '</div></div>' +
                '<div class="plan-night-section"><label>Invite Friends</label>' +
                    '<div class="plan-night-friends" id="planFriendsList"></div>' +
                    '<div class="plan-night-add-friend"><input type="text" id="planFriendInput" placeholder="Enter name or email"><button id="planAddFriendBtn">+ Add</button></div>' +
                '</div>' +
                '<div class="plan-night-section"><label>Note (optional)</label><textarea id="planNote" placeholder="Any special notes for the group..." rows="2"></textarea></div>' +
            '</div>' +
            '<div class="plan-night-footer"><button class="btn-cancel">Cancel</button><button class="btn-share">📤 Share Plan</button></div>' +
        '</div>';

        document.body.appendChild(overlay);
        requestAnimationFrame(function() { overlay.classList.add('active'); });

        // Set default datetime to next Friday 7pm
        var now = new Date();
        var daysUntilFri = (5 - now.getDay() + 7) % 7 || 7;
        var nextFri = new Date(now.getTime() + daysUntilFri * 86400000);
        nextFri.setHours(19, 0, 0, 0);
        var dtInput = document.getElementById('planDateTime');
        dtInput.value = nextFri.toISOString().slice(0, 16);

        function renderFriends() {
            var container = document.getElementById('planFriendsList');
            container.innerHTML = friends.map(function(f, i) {
                return '<div class="plan-night-friend"><span>👤 ' + f + '</span><span class="remove" data-idx="' + i + '">\u2715</span></div>';
            }).join('');

            container.querySelectorAll('.remove').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    friends.splice(parseInt(btn.dataset.idx), 1);
                    renderFriends();
                });
            });
        }

        document.getElementById('planAddFriendBtn').addEventListener('click', function() {
            var input = document.getElementById('planFriendInput');
            var val = input.value.trim();
            if (val && friends.indexOf(val) === -1) {
                friends.push(val);
                input.value = '';
                renderFriends();
            }
        });

        // Enter key to add friend
        document.getElementById('planFriendInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('planAddFriendBtn').click();
            }
        });

        var closeOverlay = function() {
            overlay.classList.remove('active');
            setTimeout(function() { overlay.remove(); }, 200);
        };

        overlay.querySelector('.plan-night-close').addEventListener('click', closeOverlay);
        overlay.querySelector('.btn-cancel').addEventListener('click', closeOverlay);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeOverlay();
        });

        overlay.querySelector('.btn-share').addEventListener('click', function() {
            var dateVal = document.getElementById('planDateTime').value;
            var note = document.getElementById('planNote').value.trim();

            var dateStr = dateVal ? new Date(dateVal).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD';
            var stops = list.items.map(function(item, i) { return (i + 1) + '. ' + item.name + ' (' + item.type + ')'; }).join('\n');
            var shareText = '🗓️ Night Out Plan: ' + list.name + '\n📅 ' + dateStr + '\n\n' +
                '📍 Itinerary:\n' + stops;

            if (friends.length > 0) {
                shareText += '\n\n👥 Going: ' + friends.join(', ');
            }
            if (note) {
                shareText += '\n\n📝 ' + note;
            }
            shareText += '\n\n— Planned with SceneLink';

            if (navigator.share) {
                navigator.share({ title: 'Night Out: ' + list.name, text: shareText }).catch(function() {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(shareText);
                showToast('Plan copied to clipboard! Share it with your friends 📋');
            }

            closeOverlay();
        });
    }

    // ============================================
    // LISTS PAGE RENDERER
    // ============================================

    function renderListsPage() {
        var container = document.getElementById('listsContent');
        if (!container) return;

        var lists = getLists();
        var searchInput = document.getElementById('listsSearchInput');
        var searchQuery = (searchInput ? searchInput.value : '').toLowerCase();
        var activeTab = document.querySelector('.lists-filter-tab.active');
        var activeFilter = activeTab ? activeTab.dataset.filter : 'all';

        var filtered = lists;

        if (searchQuery) {
            filtered = filtered.filter(function(l) {
                return l.name.toLowerCase().indexOf(searchQuery) !== -1 ||
                    l.description.toLowerCase().indexOf(searchQuery) !== -1 ||
                    l.tags.some(function(t) { return t.toLowerCase().indexOf(searchQuery) !== -1; });
            });
        }

        if (activeFilter === 'public') {
            filtered = filtered.filter(function(l) { return l.privacy === 'public'; });
        } else if (activeFilter === 'private') {
            filtered = filtered.filter(function(l) { return l.privacy === 'private'; });
        }

        // Update stats
        var totalItems = lists.reduce(function(sum, l) { return sum + l.items.length; }, 0);
        var publicCount = lists.filter(function(l) { return l.privacy === 'public'; }).length;
        var setEl = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
        setEl('statTotalLists', lists.length);
        setEl('statTotalItems', totalItems);
        setEl('statPublicLists', publicCount);
        setEl('statSharedLists', publicCount);

        if (filtered.length === 0) {
            container.innerHTML = '<div class="lists-empty">' +
                '<div class="lists-empty-icon">' + (searchQuery ? '🔍' : '📋') + '</div>' +
                '<h3>' + (searchQuery ? 'No lists found' : 'No lists yet') + '</h3>' +
                '<p>' + (searchQuery ? 'Try a different search term' : 'Create your first list to save your favorite spots!') + '</p>' +
                (!searchQuery ? '<button class="btn-create-list" onclick="window.SceneLinkLists.showCreateModal()">✨ Create Your First List</button>' : '') +
            '</div>';
            return;
        }

        container.innerHTML = '<div class="lists-grid">' +
            filtered.map(function(list) { return renderListCard(list); }).join('') +
        '</div>';

        // Attach card event listeners
        container.querySelectorAll('.list-card').forEach(function(card) {
            var listId = card.dataset.listId;

            card.querySelector('.list-card-open')?.addEventListener('click', function(e) {
                e.stopPropagation();
                showListDetail(listId);
            });

            card.querySelector('.list-card-edit')?.addEventListener('click', function(e) {
                e.stopPropagation();
                var list = getLists().find(function(l) { return l.id === listId; });
                if (list) showCreateListModal(function() { renderListsPage(); }, list);
            });

            card.querySelector('.list-card-share')?.addEventListener('click', function(e) {
                e.stopPropagation();
                var list = getLists().find(function(l) { return l.id === listId; });
                if (list) shareList(list);
            });

            card.querySelector('.list-card-delete')?.addEventListener('click', function(e) {
                e.stopPropagation();
                var listName = (getLists().find(function(l) { return l.id === listId; }) || {}).name || 'this list';
                if (confirm('Delete "' + listName + '"?')) {
                    deleteList(listId);
                    renderListsPage();
                }
            });

            card.addEventListener('click', function() { showListDetail(listId); });
        });
    }

    function renderListCard(list) {
        var itemImages = list.items.filter(function(i) { return i.image; }).slice(0, 4);
        var imageGrid;

        if (itemImages.length >= 4) {
            imageGrid = itemImages.slice(0, 4).map(function(i) { return '<img src="' + i.image + '" alt="' + i.name + '">'; }).join('');
        } else if (itemImages.length > 0) {
            imageGrid = '<img src="' + itemImages[0].image + '" alt="' + itemImages[0].name + '" style="grid-column:1/-1;grid-row:1/-1;height:160px;">';
        } else {
            imageGrid = '<div class="placeholder-img" style="grid-column:1/-1;grid-row:1/-1;height:160px;">' + list.emoji + '</div>';
        }

        var timeAgo = getTimeAgo(list.updatedAt);

        return '<div class="list-card" data-list-id="' + list.id + '">' +
            '<div class="list-card-images ' + (itemImages.length < 4 ? 'single-image' : '') + '">' + imageGrid + '</div>' +
            '<div class="list-card-body">' +
                '<div class="list-card-header">' +
                    '<h3 class="list-card-title">' + list.emoji + ' ' + list.name + '</h3>' +
                    '<span class="list-card-privacy ' + list.privacy + '">' + (list.privacy === 'public' ? '🌐' : '🔒') + ' ' + list.privacy + '</span>' +
                '</div>' +
                '<p class="list-card-desc">' + (list.description || 'No description') + '</p>' +
                '<div class="list-card-meta">' +
                    '<span>📍 ' + list.items.length + ' place' + (list.items.length !== 1 ? 's' : '') + '</span>' +
                    '<span>🕐 Updated ' + timeAgo + '</span>' +
                '</div>' +
                (list.tags.length > 0 ?
                    '<div class="list-card-tags">' + list.tags.slice(0, 3).map(function(t) { return '<span class="list-card-tag">' + t + '</span>'; }).join('') + '</div>'
                : '') +
                '<div class="list-card-actions">' +
                    '<button class="list-card-action primary list-card-open">Open</button>' +
                    '<button class="list-card-action list-card-edit">✏️ Edit</button>' +
                    '<button class="list-card-action list-card-share">↗️ Share</button>' +
                    '<button class="list-card-action list-card-delete" style="color:#f87171;">🗑️</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ============================================
    // LIST DETAIL VIEW
    // ============================================

    function showListDetail(listId) {
        var list = getLists().find(function(l) { return l.id === listId; });
        if (!list) return;

        var existing = document.querySelector('.list-detail-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.className = 'list-detail-overlay';
        overlay.innerHTML = buildDetailHTML(list);

        document.body.appendChild(overlay);
        requestAnimationFrame(function() { overlay.classList.add('active'); });

        bindDetailEvents(overlay, listId);
    }

    function buildDetailHTML(list) {
        var itemsHtml = list.items.length > 0 ?
            list.items.map(function(item) { return renderListItem(list.id, item); }).join('') :
            '<div class="lists-empty"><div class="lists-empty-icon">📍</div><h3>No places yet</h3><p>Add spots from Explore, Events, Nightlife, or Tonight\'s Picks</p></div>';

        return '' +
            // Sticky nav bar with back button
            '<div class="list-detail-nav">' +
                '<button class="list-detail-back" id="detailBackBtn">' +
                    '<svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                    'My Lists' +
                '</button>' +
                '<span class="list-detail-nav-title">' + list.emoji + ' ' + list.name + '</span>' +
                '<div class="list-detail-nav-actions">' +
                    '<button class="list-detail-nav-btn" id="navShareBtn">↗️ Share</button>' +
                    '<button class="list-detail-nav-btn" id="navEditBtn">✏️ Edit</button>' +
                '</div>' +
            '</div>' +
            // Header
            '<div class="list-detail-header">' +
                '<div class="list-detail-emoji">' + list.emoji + '</div>' +
                '<h1 class="list-detail-title">' + list.name + '</h1>' +
                '<p class="list-detail-desc">' + (list.description || 'No description') + '</p>' +
                '<div class="list-detail-meta">' +
                    '<span>📍 ' + list.items.length + ' places</span>' +
                    '<span>' + (list.privacy === 'public' ? '🌐 Public' : '🔒 Private') + '</span>' +
                    '<span>Updated ' + getTimeAgo(list.updatedAt) + '</span>' +
                '</div>' +
                '<div class="list-detail-actions">' +
                    '<button class="list-detail-action-btn primary" id="detailShareBtn">↗️ Share List</button>' +
                    '<button class="list-detail-action-btn secondary" id="detailEditBtn">✏️ Edit</button>' +
                    '<button class="list-detail-action-btn secondary" id="detailPlanBtn">🗓️ Plan Night Out</button>' +
                '</div>' +
            '</div>' +
            // Items
            '<div class="list-detail-items" id="listDetailItems">' + itemsHtml + '</div>';
    }

    function bindDetailEvents(overlay, listId) {
        var list = getLists().find(function(l) { return l.id === listId; });
        if (!list) return;

        var closeDetail = function() {
            overlay.classList.remove('active');
            setTimeout(function() { overlay.remove(); }, 200);
            if (window.renderListsPage) window.renderListsPage();
        };

        // Back button
        document.getElementById('detailBackBtn')?.addEventListener('click', closeDetail);

        // Share buttons (nav + header)
        var shareFn = function() { shareList(list); };
        document.getElementById('detailShareBtn')?.addEventListener('click', shareFn);
        document.getElementById('navShareBtn')?.addEventListener('click', shareFn);

        // Edit buttons (nav + header)
        var editFn = function() {
            showCreateListModal(function() {
                overlay.remove();
                showListDetail(listId);
                if (window.renderListsPage) window.renderListsPage();
            }, list);
        };
        document.getElementById('detailEditBtn')?.addEventListener('click', editFn);
        document.getElementById('navEditBtn')?.addEventListener('click', editFn);

        // Plan Night Out
        document.getElementById('detailPlanBtn')?.addEventListener('click', function() {
            showPlanNightOut(list);
        });

        // Remove item buttons - with undo
        overlay.querySelectorAll('.list-item-remove').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var itemId = btn.dataset.itemId;
                var itemRow = btn.closest('.list-item');
                if (!itemRow) return;

                // Find item data for undo
                var currentList = getLists().find(function(l) { return l.id === listId; });
                var itemData = currentList ? currentList.items.find(function(i) { return i.id === itemId; }) : null;

                // Visual feedback - mark as removing
                itemRow.classList.add('removing');

                // Hide the remove button, show undo message
                var actionsDiv = itemRow.querySelector('.list-item-actions');
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<div class="list-item-undo" style="display:flex;"><button class="list-item-undo-btn">Undo</button></div>';
                }

                // Set timeout to actually remove
                var undoTimer = setTimeout(function() {
                    removeItemFromList(listId, itemId);
                    // Refresh detail view
                    overlay.remove();
                    showListDetail(listId);
                }, UNDO_DURATION);

                // Undo handler
                var undoBtn = itemRow.querySelector('.list-item-undo-btn');
                if (undoBtn) {
                    undoBtn.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        clearTimeout(undoTimer);
                        itemRow.classList.remove('removing');
                        // Restore remove button
                        if (actionsDiv) {
                            actionsDiv.innerHTML = '<button class="list-item-action list-item-remove danger" data-item-id="' + itemId + '" title="Remove">\u2715</button>';
                            // Re-bind the new remove button
                            var newBtn = actionsDiv.querySelector('.list-item-remove');
                            if (newBtn) {
                                newBtn.addEventListener('click', function() {
                                    // Re-trigger the same logic
                                    overlay.remove();
                                    showListDetail(listId);
                                });
                            }
                        }
                        showToast('Restored! ✅');
                    });
                }
            });
        });
    }

    function renderListItem(listId, item) {
        return '<div class="list-item">' +
            '<div class="list-item-image">' +
                (item.image ?
                    '<img src="' + item.image + '" alt="' + item.name + '">' :
                    '<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;color:#666;font-size:24px;">📍</div>') +
            '</div>' +
            '<div class="list-item-info">' +
                '<h4 class="list-item-name">' + item.name + '</h4>' +
                '<p class="list-item-type">' + item.type + '</p>' +
                '<div class="list-item-details">' +
                    (item.rating ? '<span>★ ' + item.rating + '</span>' : '') +
                    (item.neighborhood ? '<span>📍 ' + item.neighborhood + '</span>' : '') +
                    (item.price ? '<span>' + item.price + '</span>' : '') +
                    '<span>via ' + item.source + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="list-item-actions">' +
                '<button class="list-item-action list-item-remove danger" data-item-id="' + item.id + '" title="Remove">✕</button>' +
            '</div>' +
        '</div>';
    }

    // ============================================
    // UTILITY
    // ============================================

    function getTimeAgo(dateStr) {
        var now = new Date();
        var date = new Date(dateStr);
        var diff = Math.floor((now - date) / 1000);

        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ============================================
    // INITIALIZE LISTS PAGE
    // ============================================

    function initListsPage() {
        var searchInput = document.getElementById('listsSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() { renderListsPage(); });
        }

        document.querySelectorAll('.lists-filter-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.lists-filter-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                renderListsPage();
            });
        });

        document.getElementById('btnCreateList')?.addEventListener('click', function() {
            showCreateListModal(function() { renderListsPage(); });
        });

        renderListsPage();
    }

    // ============================================
    // PUBLIC API
    // ============================================

    window.SceneLinkLists = {
        getLists: getLists,
        createList: createList,
        updateList: updateList,
        deleteList: deleteList,
        addItemToList: addItemToList,
        removeItemFromList: removeItemFromList,
        showSaveToList: showSaveToListDropdown,
        showCreateModal: showCreateListModal,
        shareList: shareList,
        showListDetail: showListDetail,
        showPlanNightOut: showPlanNightOut,
        showToast: showToast,
        init: initListsPage
    };

    window.renderListsPage = renderListsPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById('listsContent')) initListsPage();
        });
    } else {
        if (document.getElementById('listsContent')) initListsPage();
    }

})();