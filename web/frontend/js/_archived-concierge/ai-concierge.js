/* ==============================================
   SceneLink AI Concierge v3 — Premium Experience
   ============================================== */
(function () {
    'use strict';

    if (window.__slConciergeV3) return;
    window.__slConciergeV3 = true;

    /* ---- Knowledge Base ---- */
    var restaurants = [
        { name: 'Mamma Maria', type: 'Italian', cuisine: 'Italian', price: '$$$$', rating: 4.8, reviews: 892, neighborhood: 'North End', address: '3 North Square', hours: '5 PM - 10 PM', vibe: 'romantic', desc: 'Elegant Italian dining in a historic North End brownstone with seasonally inspired dishes and an award-winning wine list.', tags: ['Fine Dining', 'Romantic', 'Wine List'], phone: '(617) 523-0077' },
        { name: 'Bar Mezzana', type: 'Italian', cuisine: 'Italian', price: '$$$', rating: 4.6, reviews: 734, neighborhood: 'South End', address: '360 Harrison Ave', hours: '5 PM - 11 PM', vibe: 'trendy', desc: 'Coastal Italian cuisine with housemade pasta, crudo bar, and inventive cocktails in a stylish South End setting.', tags: ['Pasta', 'Cocktails', 'Trendy'], phone: '(617) 530-1770' },
        { name: 'Neptune Oyster', type: 'Seafood', cuisine: 'Seafood', price: '$$$', rating: 4.7, reviews: 1203, neighborhood: 'North End', address: '63 Salem St', hours: '11:30 AM - 10 PM', vibe: 'lively', desc: 'Iconic raw bar and seafood spot known for its legendary lobster roll and pristine oyster selection.', tags: ['Seafood', 'Raw Bar', 'Iconic'], phone: '(617) 742-3474' },
        { name: 'O Ya', type: 'Japanese', cuisine: 'Japanese', price: '$$$$', rating: 4.9, reviews: 567, neighborhood: 'Leather District', address: '9 East St', hours: '5 PM - 10 PM', vibe: 'upscale', desc: 'Two Michelin-starred omakase experience blending Japanese tradition with modern creativity. Boston\'s finest sushi.', tags: ['Omakase', 'Michelin Star', 'Sushi'], phone: '(617) 654-9900' },
        { name: 'Toro', type: 'Spanish', cuisine: 'Spanish', price: '$$$', rating: 4.5, reviews: 1456, neighborhood: 'South End', address: '1704 Washington St', hours: '5:30 PM - 12 AM', vibe: 'lively', desc: 'Ken Oringer\'s acclaimed tapas bar with bold Spanish flavors, communal energy, and an exceptional vermouth selection.', tags: ['Tapas', 'Groups', 'Late Night'], phone: '(617) 536-4300' },
        { name: 'Sarma', type: 'Mediterranean', cuisine: 'Mediterranean', price: '$$$', rating: 4.7, reviews: 823, neighborhood: 'Somerville', address: '249 Pearl St', hours: '5 PM - 11 PM', vibe: 'lively', desc: 'Vibrant Mediterranean meze and small plates with Turkish, Lebanese, and Greek influences in a buzzy atmosphere.', tags: ['Meze', 'Small Plates', 'Vibrant'], phone: '(617) 764-4464' },
        { name: 'Uni', type: 'Japanese', cuisine: 'Japanese', price: '$$$$', rating: 4.6, reviews: 445, neighborhood: 'Back Bay', address: '370A Commonwealth Ave', hours: '5 PM - 12 AM', vibe: 'trendy', desc: 'Izakaya-inspired sashimi bar inside the Eliot Hotel. Creative Japanese small plates and rare sake selections.', tags: ['Sashimi', 'Sake', 'Late Night'], phone: '(617) 536-7200' },
        { name: 'Row 34', type: 'Seafood', cuisine: 'Seafood', price: '$$$', rating: 4.5, reviews: 987, neighborhood: 'Fort Point', address: '383 Congress St', hours: '11:30 AM - 11 PM', vibe: 'casual', desc: 'Industrial-chic oyster bar and craft beer destination in Fort Point. Fresh seafood and an extensive draught list.', tags: ['Oysters', 'Craft Beer', 'Casual'], phone: '(617) 553-5900' },
        { name: 'Giulia', type: 'Italian', cuisine: 'Italian', price: '$$$$', rating: 4.8, reviews: 612, neighborhood: 'Cambridge', address: '1682 Massachusetts Ave', hours: '5:30 PM - 10 PM', vibe: 'romantic', desc: 'Handmade pasta and wood-fired dishes in an intimate Cambridge setting. One of the best Italian restaurants in Greater Boston.', tags: ['Pasta', 'Intimate', 'Wood-Fired'], phone: '(617) 441-2800' },
        { name: 'The Salty Pig', type: 'American', cuisine: 'American', price: '$$', rating: 4.3, reviews: 1678, neighborhood: 'Back Bay', address: '130 Dartmouth St', hours: '11 AM - 12 AM', vibe: 'casual', desc: 'Charcuterie-focused gastropub with artisan pizzas, craft cocktails, and a lively Back Bay patio scene.', tags: ['Charcuterie', 'Pizza', 'Patio'], phone: '(617) 536-6200' },
        { name: 'Yvonne\'s', type: 'American', cuisine: 'American', price: '$$$$', rating: 4.4, reviews: 534, neighborhood: 'Downtown', address: '2 Winter Pl', hours: '4 PM - 2 AM', vibe: 'upscale', desc: 'Supper club meets speakeasy in a stunning Downtown Crossing space. Shareable plates, craft cocktails, and a see-and-be-seen crowd.', tags: ['Supper Club', 'Cocktails', 'Late Night'], phone: '(617) 267-0047' },
        { name: 'Myers + Chang', type: 'Asian', cuisine: 'Asian Fusion', price: '$$', rating: 4.5, reviews: 1102, neighborhood: 'South End', address: '1145 Washington St', hours: '11:30 AM - 10 PM', vibe: 'lively', desc: 'Fun, vibrant Asian-inspired diner with bold wok-fired dishes, creative dim sum, and craft cocktails.', tags: ['Asian Fusion', 'Dim Sum', 'Fun'], phone: '(617) 542-5200' }
    ];

    var nightlife = [
        { name: 'Drink', type: 'Cocktail Bar', price: '$$$', rating: 4.8, reviews: 1345, neighborhood: 'Fort Point', address: '348 Congress St', hours: '4 PM - 1 AM', vibe: 'intimate', desc: 'No-menu speakeasy where expert bartenders craft bespoke cocktails based on your mood. Dimly lit and unforgettable.', tags: ['Speakeasy', 'Bespoke Cocktails', 'Intimate'] },
        { name: 'Hecate', type: 'Cocktail Lounge', price: '$$$', rating: 4.6, reviews: 423, neighborhood: 'Back Bay', address: '119 Brattle St', hours: '5 PM - 1 AM', vibe: 'upscale', desc: 'Sophisticated cocktail den beneath Yvonne\'s with moody interiors, craft drinks, and an air of mystery.', tags: ['Lounge', 'Moody', 'Craft Cocktails'] },
        { name: 'Lookout Rooftop', type: 'Rooftop Bar', price: '$$$', rating: 4.5, reviews: 876, neighborhood: 'Seaport', address: '70 Sleeper St', hours: '4 PM - 12 AM', vibe: 'trendy', desc: 'Seaport rooftop with panoramic harbor views, craft cocktails, and a chic outdoor lounge vibe.', tags: ['Rooftop', 'Views', 'Outdoor'] },
        { name: 'Wally\'s Cafe Jazz Club', type: 'Live Music', price: '$', rating: 4.7, reviews: 2134, neighborhood: 'South End', address: '427 Massachusetts Ave', hours: '6 PM - 2 AM', vibe: 'lively', desc: 'Boston\'s legendary jazz club since 1947. Live music every night with no cover. Berklee students jam alongside pros.', tags: ['Jazz', 'Live Music', 'No Cover'] },
        { name: 'The Grand', type: 'Nightclub', price: '$$$', rating: 4.3, reviews: 567, neighborhood: 'Theater District', address: '58 Seaport Blvd', hours: '10 PM - 2 AM', vibe: 'energetic', desc: 'Premier nightclub with international DJs, VIP bottle service, and a massive dance floor.', tags: ['Nightclub', 'DJs', 'VIP'] },
        { name: 'Citrus & Salt', type: 'Cocktail Bar', price: '$$', rating: 4.4, reviews: 654, neighborhood: 'Back Bay', address: '142 Berkeley St', hours: '4 PM - 1 AM', vibe: 'lively', desc: 'Vibrant tequila and mezcal bar with creative margaritas, tacos, and a fun Back Bay atmosphere.', tags: ['Tequila', 'Margaritas', 'Lively'] },
        { name: 'Bijou Nightclub', type: 'Nightclub', price: '$$', rating: 4.2, reviews: 789, neighborhood: 'Theater District', address: '51 Stuart St', hours: '10 PM - 2 AM', vibe: 'energetic', desc: 'Multi-level club with themed nights, Top 40 and EDM, bottle service, and a diverse crowd.', tags: ['Dancing', 'EDM', 'Themed Nights'] },
        { name: 'Trillium Garden', type: 'Beer Garden', price: '$$', rating: 4.6, reviews: 1234, neighborhood: 'Greenway', address: 'Rose Kennedy Greenway', hours: '11 AM - 10 PM', vibe: 'casual', desc: 'Seasonal outdoor beer garden on the Greenway serving Trillium\'s acclaimed craft beers and local food vendors.', tags: ['Craft Beer', 'Outdoor', 'Seasonal'] }
    ];

    var events = [
        { name: 'Boston Jazz Festival', venue: 'Symphony Hall', date: 'This Friday', time: '8:00 PM', price: 'From $45', category: 'Music', desc: 'World-class jazz performances featuring renowned artists.', tags: ['Jazz', 'Live Performance'] },
        { name: 'Stand-Up Comedy Night', venue: 'Laugh Factory', date: 'Saturday', time: '9:00 PM', price: '$25', category: 'Comedy', desc: 'Top comedians from NYC and LA perform their latest material.', tags: ['Comedy', 'Stand-Up'] },
        { name: 'Boston Food & Wine Festival', venue: 'Seaport District', date: 'Next Sunday', time: '12:00 PM', price: 'Free Entry', category: 'Food & Drink', desc: 'Sample dishes from 40+ local restaurants with wine pairings.', tags: ['Food Festival', 'Wine', 'Free'] },
        { name: 'Rooftop DJ Set', venue: 'The Envoy', date: 'Tonight', time: '9:00 PM', price: '$30', category: 'Nightlife', desc: 'Sunset-to-midnight DJ set with panoramic harbor views.', tags: ['DJ', 'Rooftop', 'Tonight'] },
        { name: 'Latin Dance Social', venue: 'Havana Club', date: 'Tonight', time: '8:30 PM', price: '$15', category: 'Dance', desc: 'Salsa, bachata, and merengue with a live band. Lessons at 8 PM.', tags: ['Dance', 'Latin', 'Tonight'] },
        { name: 'Indie Rock Showcase', venue: 'The Paradise', date: 'Thursday', time: '7:30 PM', price: '$20', category: 'Music', desc: 'Three emerging indie bands plus local openers.', tags: ['Indie', 'Rock', 'Live Music'] }
    ];

    var neighborhoods = {
        'North End': { vibe: 'Historic Italian quarter', known: 'Italian restaurants, pastry shops, historic Freedom Trail sites', topPick: 'Mamma Maria for dinner, Mike\'s Pastry for cannoli' },
        'South End': { vibe: 'Trendy and diverse', known: 'Farm-to-table dining, art galleries, vibrant nightlife', topPick: 'Toro for tapas, Wally\'s for late-night jazz' },
        'Back Bay': { vibe: 'Upscale and polished', known: 'Fine dining, boutique shopping on Newbury St, cocktail lounges', topPick: 'Uni for sashimi, Hecate for cocktails' },
        'Seaport': { vibe: 'Modern and waterfront', known: 'Rooftop bars, seafood restaurants, harbor views', topPick: 'Lookout Rooftop for drinks, Row 34 for oysters' },
        'Cambridge': { vibe: 'Academic and eclectic', known: 'Harvard/MIT area, diverse cuisines, bookstores and cafes', topPick: 'Giulia for pasta, Lamplighter Brewing for craft beer' },
        'Fort Point': { vibe: 'Artsy and industrial-chic', known: 'Art studios, craft cocktails, converted warehouse spaces', topPick: 'Drink for cocktails, Row 34 for seafood' },
        'Somerville': { vibe: 'Creative and neighborhood-y', known: 'Davis Square scene, eclectic dining, local music venues', topPick: 'Sarma for meze, Aeronaut Brewing for beer' },
        'Downtown': { vibe: 'Central and bustling', known: 'Theater District nightlife, supper clubs, historic pubs', topPick: 'Yvonne\'s for dinner and drinks' }
    };

    /* ---- Conversation State ---- */
    var conversationHistory = [];
    var lastTopic = null;
    var userPreferences = {};

    /* ---- Page Context ---- */
    function getPageContext() {
        var path = window.location.pathname.toLowerCase();
        if (path.indexOf('tonight') > -1) return { page: 'Tonight\'s Picks', type: 'tonight' };
        if (path.indexOf('nightlife') > -1) return { page: 'Nightlife', type: 'nightlife' };
        if (path.indexOf('event') > -1) return { page: 'Events', type: 'events' };
        if (path.indexOf('explore') > -1) return { page: 'Explore', type: 'explore' };
        if (path.indexOf('social') > -1) return { page: 'Social', type: 'social' };
        if (path.indexOf('plan') > -1) return { page: 'Plan with Friends', type: 'planning' };
        return { page: 'Home', type: 'home' };
    }

    function getQuickActions(ctx) {
        switch (ctx.type) {
            case 'nightlife': return ['Best cocktail bars', 'Rooftop bars nearby', 'Live music tonight', 'Where to dance'];
            case 'events': return ['What\'s happening tonight', 'Free events this week', 'Live music shows', 'Food festivals'];
            case 'tonight': return ['Best date night spot', 'Group dinner ideas', 'Late night options', 'Best happy hours'];
            case 'explore': return ['Top rated restaurants', 'Hidden gem finds', 'Best for brunch', 'Outdoor dining'];
            case 'social': return ['Popular with friends', 'Trending venues', 'Most reviewed spots', 'New openings'];
            case 'planning': return ['Group dinner spots', 'Birthday venues', 'Affordable options', 'Private dining'];
            default: return ['Recommend a restaurant', 'Best bars tonight', 'Upcoming events', 'Explore neighborhoods'];
        }
    }

    /* ---- Smart Response Engine ---- */
    function generateResponse(query) {
        var q = query.toLowerCase().trim();
        var response = { text: '', venues: [], followUp: '' };

        // Greetings
        if (/^(hi|hello|hey|what's up|howdy|yo|sup)/i.test(q)) {
            response.text = 'Hey there! I\'m your SceneLink guide to Boston\'s best dining and nightlife. What are you in the mood for tonight?';
            response.followUp = 'Try asking about a cuisine type, neighborhood, or vibe.';
            return response;
        }

        // Thanks
        if (/^(thanks|thank you|thx|cheers|appreciate)/i.test(q)) {
            response.text = 'You\'re welcome! Let me know if you need anything else. Enjoy your night out in Boston!';
            return response;
        }

        // Italian cuisine
        if (q.indexOf('italian') > -1 || q.indexOf('pasta') > -1) {
            lastTopic = 'italian';
            var italianPlaces = restaurants.filter(function(r) { return r.cuisine === 'Italian'; });
            response.text = 'Boston\'s North End is practically Little Italy. Here are the top Italian spots:';
            response.venues = italianPlaces;
            response.followUp = 'Want me to compare these, or find something in a specific neighborhood?';
            return response;
        }

        // Japanese / Sushi
        if (q.indexOf('japanese') > -1 || q.indexOf('sushi') > -1 || q.indexOf('omakase') > -1) {
            lastTopic = 'japanese';
            var japanesePlaces = restaurants.filter(function(r) { return r.cuisine === 'Japanese'; });
            response.text = 'Boston has some exceptional Japanese dining. Here are the standouts:';
            response.venues = japanesePlaces;
            response.followUp = 'O Ya is Michelin-starred if you\'re looking for a special occasion.';
            return response;
        }

        // Seafood
        if (q.indexOf('seafood') > -1 || q.indexOf('oyster') > -1 || q.indexOf('lobster') > -1 || q.indexOf('fish') > -1) {
            lastTopic = 'seafood';
            var seafoodPlaces = restaurants.filter(function(r) { return r.cuisine === 'Seafood'; });
            response.text = 'You\'re in the right city for seafood. Here are the must-visits:';
            response.venues = seafoodPlaces;
            response.followUp = 'Neptune Oyster has the most famous lobster roll in Boston — expect a line!';
            return response;
        }

        // Asian
        if (q.indexOf('asian') > -1 || q.indexOf('chinese') > -1 || q.indexOf('dim sum') > -1 || q.indexOf('thai') > -1) {
            lastTopic = 'asian';
            var asianPlaces = restaurants.filter(function(r) { return r.cuisine === 'Asian Fusion' || r.cuisine === 'Japanese'; });
            response.text = 'Here are some top Asian-inspired spots in Boston:';
            response.venues = asianPlaces;
            return response;
        }

        // Spanish / Tapas
        if (q.indexOf('spanish') > -1 || q.indexOf('tapas') > -1) {
            lastTopic = 'spanish';
            response.text = 'For authentic Spanish tapas in Boston, Toro is the undisputed king:';
            response.venues = restaurants.filter(function(r) { return r.cuisine === 'Spanish'; });
            return response;
        }

        // Mediterranean
        if (q.indexOf('mediterranean') > -1 || q.indexOf('meze') > -1 || q.indexOf('middle eastern') > -1) {
            lastTopic = 'mediterranean';
            response.text = 'Craving Mediterranean flavors? Sarma is the one to beat:';
            response.venues = restaurants.filter(function(r) { return r.cuisine === 'Mediterranean'; });
            return response;
        }

        // Date night / romantic
        if (q.indexOf('date') > -1 || q.indexOf('romantic') > -1 || q.indexOf('anniversary') > -1 || q.indexOf('special occasion') > -1) {
            lastTopic = 'date';
            var romanticSpots = restaurants.filter(function(r) { return r.vibe === 'romantic' || r.vibe === 'upscale'; });
            response.text = 'Planning something special? Here are Boston\'s most romantic dining experiences:';
            response.venues = romanticSpots.slice(0, 3);
            response.followUp = 'Pro tip: Follow dinner with cocktails at Drink or Hecate for the perfect evening.';
            return response;
        }

        // Groups / friends
        if (q.indexOf('group') > -1 || q.indexOf('friends') > -1 || q.indexOf('party') > -1 || q.indexOf('birthday') > -1 || q.indexOf('large') > -1) {
            lastTopic = 'group';
            var groupSpots = restaurants.filter(function(r) { return r.vibe === 'lively'; });
            response.text = 'Great for groups and celebrations — places with energy and shareable menus:';
            response.venues = groupSpots.slice(0, 3);
            response.followUp = 'Toro and Myers + Chang are perfect for sharing plates with a crowd.';
            return response;
        }

        // Cheap / budget / affordable
        if (q.indexOf('cheap') > -1 || q.indexOf('budget') > -1 || q.indexOf('affordable') > -1 || q.indexOf('under') > -1 || q.indexOf('inexpensive') > -1) {
            lastTopic = 'budget';
            var budgetSpots = restaurants.filter(function(r) { return r.price === '$$'; });
            response.text = 'Great food doesn\'t have to break the bank. Here are top value picks:';
            response.venues = budgetSpots;
            response.followUp = 'Also check out Wally\'s Cafe for free live jazz every night.';
            return response;
        }

        // Fine dining / upscale / fancy
        if (q.indexOf('fine dining') > -1 || q.indexOf('upscale') > -1 || q.indexOf('fancy') > -1 || q.indexOf('michelin') > -1 || q.indexOf('best') > -1 && q.indexOf('restaurant') > -1) {
            lastTopic = 'fine dining';
            var fineSpots = restaurants.filter(function(r) { return r.price === '$$$$'; });
            response.text = 'For a truly elevated dining experience in Boston:';
            response.venues = fineSpots.slice(0, 4);
            response.followUp = 'O Ya holds two Michelin stars — book well in advance.';
            return response;
        }

        // Cocktails / bars / drinks
        if (q.indexOf('cocktail') > -1 || q.indexOf('bar') > -1 || q.indexOf('drink') > -1 || q.indexOf('happy hour') > -1 || q.indexOf('lounge') > -1) {
            lastTopic = 'bars';
            var bars = nightlife.filter(function(v) { return v.type.indexOf('Cocktail') > -1 || v.type.indexOf('Lounge') > -1; });
            response.text = 'Boston\'s cocktail scene is world-class. Here are the best spots:';
            response.venues = bars;
            response.followUp = 'Drink has no menu — just tell the bartender your mood and they\'ll create something perfect.';
            return response;
        }

        // Rooftop
        if (q.indexOf('rooftop') > -1 || q.indexOf('view') > -1 || q.indexOf('outdoor') > -1 || q.indexOf('patio') > -1) {
            lastTopic = 'rooftop';
            var rooftops = nightlife.filter(function(v) { return v.type.indexOf('Rooftop') > -1 || v.type.indexOf('Garden') > -1; });
            response.text = 'Perfect for enjoying the weather and the views:';
            response.venues = rooftops;
            response.followUp = 'Trillium Garden is seasonal — check if it\'s open for the season!';
            return response;
        }

        // Live music / jazz
        if (q.indexOf('live music') > -1 || q.indexOf('jazz') > -1 || q.indexOf('music') > -1 || q.indexOf('concert') > -1 || q.indexOf('band') > -1) {
            lastTopic = 'music';
            var musicVenues = nightlife.filter(function(v) { return v.type === 'Live Music'; });
            var musicEvents = events.filter(function(e) { return e.category === 'Music'; });
            response.text = 'Boston has an incredible live music scene:';
            response.venues = musicVenues;
            if (musicEvents.length) {
                response.text += '\n\nUpcoming music events:';
                musicEvents.forEach(function(e) {
                    response.text += '\n  ' + e.name + ' at ' + e.venue + ' — ' + e.date + ' ' + e.time + ' (' + e.price + ')';
                });
            }
            response.followUp = 'Wally\'s has free live jazz every single night — a Boston institution since 1947.';
            return response;
        }

        // Dancing / nightclub / club
        if (q.indexOf('dance') > -1 || q.indexOf('club') > -1 || q.indexOf('nightclub') > -1 || q.indexOf('dj') > -1 || q.indexOf('edm') > -1) {
            lastTopic = 'clubs';
            var clubs = nightlife.filter(function(v) { return v.type === 'Nightclub'; });
            response.text = 'Ready to hit the dance floor? Here are Boston\'s top clubs:';
            response.venues = clubs;
            response.followUp = 'Most clubs are in the Theater District. Cover charges apply on weekends.';
            return response;
        }

        // Tonight / what's happening
        if (q.indexOf('tonight') > -1 || q.indexOf('happening') > -1 || q.indexOf('now') > -1 || q.indexOf('this evening') > -1) {
            lastTopic = 'tonight';
            var tonightEvents = events.filter(function(e) { return e.date === 'Tonight'; });
            response.text = 'Here\'s what\'s happening tonight in Boston:';
            if (tonightEvents.length) {
                tonightEvents.forEach(function(e) {
                    response.text += '\n\n' + e.name + '\n  ' + e.venue + ' at ' + e.time + ' — ' + e.price + '\n  ' + e.desc;
                });
            }
            var lateSpots = nightlife.filter(function(v) { return v.vibe === 'lively' || v.vibe === 'energetic'; }).slice(0, 2);
            response.venues = lateSpots;
            response.followUp = 'Want me to narrow these down by vibe or neighborhood?';
            return response;
        }

        // Events
        if (q.indexOf('event') > -1 || q.indexOf('festival') > -1 || q.indexOf('show') > -1 || q.indexOf('comedy') > -1 || q.indexOf('free event') > -1) {
            lastTopic = 'events';
            response.text = 'Here are upcoming events in Boston:';
            events.forEach(function(e) {
                response.text += '\n\n' + e.name + '\n  ' + e.venue + ' — ' + e.date + ' at ' + e.time + '\n  ' + e.price + ' | ' + e.desc;
            });
            response.followUp = 'Want me to filter by category (music, comedy, food) or date?';
            return response;
        }

        // Neighborhood queries
        var matchedHood = null;
        Object.keys(neighborhoods).forEach(function(hood) {
            if (q.indexOf(hood.toLowerCase()) > -1) matchedHood = hood;
        });
        if (q.indexOf('neighborhood') > -1 || q.indexOf('area') > -1 || matchedHood) {
            lastTopic = 'neighborhoods';
            if (matchedHood) {
                var info = neighborhoods[matchedHood];
                response.text = '<strong>' + matchedHood + '</strong>\n\nVibe: ' + info.vibe + '\nKnown for: ' + info.known + '\nTop picks: ' + info.topPick;
                var hoodVenues = restaurants.filter(function(r) { return r.neighborhood === matchedHood; })
                    .concat(nightlife.filter(function(v) { return v.neighborhood === matchedHood; }));
                response.venues = hoodVenues.slice(0, 3);
                response.followUp = 'Want to explore another neighborhood?';
            } else {
                response.text = 'Boston has amazing neighborhoods, each with its own personality:\n';
                Object.keys(neighborhoods).forEach(function(hood) {
                    response.text += '\n<strong>' + hood + '</strong> — ' + neighborhoods[hood].vibe;
                });
                response.followUp = 'Ask about any neighborhood for detailed picks and tips.';
            }
            return response;
        }

        // Late night
        if (q.indexOf('late') > -1 || q.indexOf('after midnight') > -1 || q.indexOf('open late') > -1) {
            lastTopic = 'late night';
            var lateNight = restaurants.filter(function(r) { return r.hours.indexOf('12 AM') > -1 || r.hours.indexOf('2 AM') > -1; })
                .concat(nightlife.filter(function(v) { return v.hours.indexOf('1 AM') > -1 || v.hours.indexOf('2 AM') > -1; }));
            response.text = 'Still going strong? These spots are open late:';
            response.venues = lateNight.slice(0, 4);
            return response;
        }

        // Brunch
        if (q.indexOf('brunch') > -1 || q.indexOf('breakfast') > -1 || q.indexOf('morning') > -1) {
            response.text = 'For the best brunch in Boston, I\'d recommend:\n\n' +
                '1. <strong>The Salty Pig</strong> (Back Bay) — Charcuterie boards and artisan pizzas\n' +
                '2. <strong>Myers + Chang</strong> (South End) — Asian-inspired brunch with creative dim sum\n' +
                '3. <strong>Row 34</strong> (Fort Point) — Seafood brunch with craft beers\n\n' +
                'Most brunch spots get busy by 11 AM on weekends — arrive early or make a reservation.';
            return response;
        }

        // Help / what can you do
        if (q.indexOf('help') > -1 || q.indexOf('what can') > -1 || q.indexOf('how do') > -1) {
            response.text = 'I can help you with:\n\n' +
                '  <strong>Restaurants</strong> — Find by cuisine, vibe, price, or neighborhood\n' +
                '  <strong>Nightlife</strong> — Bars, clubs, lounges, live music venues\n' +
                '  <strong>Events</strong> — What\'s happening tonight, this week, or upcoming\n' +
                '  <strong>Neighborhoods</strong> — Learn about each area\'s personality and top spots\n' +
                '  <strong>Recommendations</strong> — Date night, group outings, special occasions\n\n' +
                'Just ask naturally — like "Where should I go for a romantic dinner?" or "Best cocktail bars in Back Bay."';
            return response;
        }

        // Recommend / suggestion / suggest
        if (q.indexOf('recommend') > -1 || q.indexOf('suggest') > -1 || q.indexOf('where should') > -1 || q.indexOf('what should') > -1) {
            lastTopic = 'recommend';
            var topPicks = [restaurants[0], restaurants[3], restaurants[2]]; // Mamma Maria, O Ya, Neptune
            response.text = 'Here are my top recommendations for tonight:';
            response.venues = topPicks;
            response.followUp = 'Tell me more about what you\'re looking for — cuisine, vibe, budget — and I\'ll fine-tune my picks.';
            return response;
        }

        // Default: Try to match any restaurant or venue name
        var foundVenue = null;
        restaurants.concat(nightlife).forEach(function(v) {
            if (q.indexOf(v.name.toLowerCase()) > -1) foundVenue = v;
        });
        if (foundVenue) {
            response.text = 'Here\'s what I know about <strong>' + foundVenue.name + '</strong>:';
            response.venues = [foundVenue];
            return response;
        }

        // Fallback
        response.text = 'I\'d love to help with that! I\'m best at finding restaurants, bars, nightlife, events, and neighborhoods in Boston.\n\nTry asking:\n  "Best Italian restaurants"\n  "Rooftop bars with views"\n  "What\'s happening tonight"\n  "Tell me about the South End"';
        return response;
    }

    /* ---- Venue Photo Map ---- */
    var venuePhotos = {
        'Mamma Maria': '/assets/img/placeholder-venue.svg',
        'Bar Mezzana': '/assets/img/placeholder-venue.svg',
        'Neptune Oyster': '/assets/img/placeholder-venue.svg',
        'O Ya': '/assets/img/placeholder-venue.svg',
        'Toro': '/assets/img/placeholder-venue.svg',
        'Sarma': '/assets/img/placeholder-venue.svg',
        'Uni': '/assets/img/placeholder-venue.svg',
        'Row 34': '/assets/img/placeholder-venue.svg',
        'Giulia': '/assets/img/placeholder-venue.svg',
        'The Salty Pig': '/assets/img/placeholder-venue.svg',
        "Yvonne's": '/assets/img/placeholder-venue.svg',
        'Myers + Chang': '/assets/img/placeholder-venue.svg',
        'Drink': '/assets/img/placeholder-venue.svg',
        'Hecate': '/assets/img/placeholder-venue.svg',
        'Lookout Rooftop': '/assets/img/placeholder-venue.svg',
        "Wally's Cafe Jazz Club": '/assets/img/placeholder-venue.svg',
        'The Grand': '/assets/img/placeholder-venue.svg',
        'Citrus & Salt': '/assets/img/placeholder-venue.svg',
        'Bijou Nightclub': '/assets/img/placeholder-venue.svg',
        'Trillium Garden': '/assets/img/placeholder-venue.svg'
    };
    var defaultPhoto = '/assets/img/placeholder-venue.svg';

    /* ---- Venue Card Builder (Premium v4) ---- */
    function buildVenueCard(v) {
        var priceDisplay = v.price || '';
        var typeDisplay = v.type || v.cuisine || '';
        var hoodDisplay = v.neighborhood || '';
        var hoursDisplay = v.hours || '';
        var photoUrl = venuePhotos[v.name] || defaultPhoto;
        var reviewCount = v.reviews ? '(' + v.reviews.toLocaleString() + ')' : '';
        var vibeLabel = v.vibe ? v.vibe.charAt(0).toUpperCase() + v.vibe.slice(1) : '';
        var safeName = v.name.replace(/'/g, "\\'");

        return '<div class="sl-venue-card">' +
            '<img class="sl-venue-photo" src="' + photoUrl + '" alt="' + v.name + '" onerror="this.style.display=\'none\'">' +
            '<div class="sl-venue-card-body">' +
                '<div class="sl-venue-card-top">' +
                    '<div class="sl-venue-name">' + v.name + '</div>' +
                    (v.rating ? '<div class="sl-venue-rating"><span class="star">&#9733;</span> ' + v.rating + ' <span style="color:#777;font-weight:400;font-size:10.5px">' + reviewCount + '</span></div>' : '') +
                '</div>' +
                '<div class="sl-venue-location">' +
                    '<i class="fas fa-map-marker-alt"></i> ' +
                    '<span>' + hoodDisplay + '</span>' +
                    (typeDisplay ? '<span class="sep">&middot;</span><span>' + typeDisplay + '</span>' : '') +
                    (priceDisplay ? '<span class="sep">&middot;</span><span>' + priceDisplay + '</span>' : '') +
                '</div>' +
                (v.desc ? '<div class="sl-venue-desc">' + v.desc + '</div>' : '') +
                '<div class="sl-venue-info-row">' +
                    (hoursDisplay ? '<span class="sl-venue-chip"><i class="fas fa-clock"></i> ' + hoursDisplay + '</span>' : '') +
                    (vibeLabel ? '<span class="sl-venue-chip"><i class="fas fa-sparkles"></i> ' + vibeLabel + '</span>' : '') +
                    (v.address ? '<span class="sl-venue-chip"><i class="fas fa-location-dot"></i> ' + v.address + '</span>' : '') +
                '</div>' +
                (v.tags ? '<div class="sl-venue-tags">' + v.tags.map(function(t) { return '<span class="sl-venue-tag">' + t + '</span>'; }).join('') + '</div>' : '') +
                '<div class="sl-venue-actions">' +
                    '<button class="sl-venue-action-btn primary" onclick="event.stopPropagation();window.__slConciergeViewDetail(\'' + safeName + '\')"><i class="fas fa-eye"></i> Details</button>' +
                    '<button class="sl-venue-action-btn secondary" onclick="event.stopPropagation();window.__slConciergePlanNight(\'' + safeName + '\')"><i class="fas fa-calendar-plus"></i> Plan</button>' +
                    '<button class="sl-venue-action-btn icon-only" onclick="event.stopPropagation();window.__slConciergeSave(this,\'' + safeName + '\')" title="Save to Favorites"><i class="fas fa-heart"></i></button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    /* ---- Build UI ---- */
    function buildUI() {
        var ctx = getPageContext();
        var actions = getQuickActions(ctx);

        // FAB
        var fab = document.createElement('button');
        fab.className = 'sl-concierge-fab';
        fab.setAttribute('aria-label', 'Open AI Concierge');
        fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

        // Panel
        var panel = document.createElement('div');
        panel.className = 'sl-concierge-panel';
        panel.innerHTML =
            '<div class="sl-concierge-header">' +
                '<div class="sl-concierge-header-left">' +
                    '<div class="sl-concierge-avatar"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg></div>' +
                    '<div class="sl-concierge-header-info">' +
                        '<h4>SceneLink AI</h4>' +
                        '<div class="sl-concierge-status"><div class="sl-concierge-status-dot"></div><span>Online</span></div>' +
                    '</div>' +
                '</div>' +
                '<button class="sl-concierge-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
            '</div>' +
            '<div class="sl-concierge-messages"></div>' +
            '<div class="sl-concierge-input">' +
                '<input type="text" placeholder="Ask about restaurants, bars, events..." />' +
                '<button aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
            '</div>';

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        // References
        var messages = panel.querySelector('.sl-concierge-messages');
        var inputField = panel.querySelector('.sl-concierge-input input');
        var sendBtn = panel.querySelector('.sl-concierge-input button');
        var closeBtn = panel.querySelector('.sl-concierge-close');

        var isOpen = false;
        var hasGreeted = false;

        // Add message
        function addMessage(html, type) {
            var wrapper = document.createElement('div');
            wrapper.className = 'sl-msg sl-msg-' + type;
            wrapper.innerHTML = '<div class="sl-msg-bubble">' + html + '</div>';
            messages.appendChild(wrapper);
            messages.scrollTop = messages.scrollHeight;
        }

        // Add venue cards
        function addVenueCards(venueList) {
            venueList.forEach(function(v) {
                var wrapper = document.createElement('div');
                wrapper.className = 'sl-msg sl-msg-bot';
                wrapper.innerHTML = buildVenueCard(v);
                messages.appendChild(wrapper);
            });
            messages.scrollTop = messages.scrollHeight;
        }

        // Add quick actions
        function addQuickActions(actionList) {
            var wrapper = document.createElement('div');
            wrapper.className = 'sl-msg sl-msg-bot';
            var btns = '<div class="sl-quick-actions">';
            actionList.forEach(function(action) {
                btns += '<button class="sl-quick-btn">' + action + '</button>';
            });
            btns += '</div>';
            wrapper.innerHTML = btns;
            messages.appendChild(wrapper);

            wrapper.querySelectorAll('.sl-quick-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    handleUserMessage(btn.textContent);
                });
            });
            messages.scrollTop = messages.scrollHeight;
        }

        // Typing indicator
        function showTyping() {
            var typing = document.createElement('div');
            typing.className = 'sl-msg sl-msg-bot sl-typing-wrapper';
            typing.innerHTML = '<div class="sl-typing"><div class="sl-typing-dot"></div><div class="sl-typing-dot"></div><div class="sl-typing-dot"></div></div>';
            messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;
            return typing;
        }

        function removeTyping(el) {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }

        // Handle user message
        function handleUserMessage(text) {
            if (!text.trim()) return;
            addMessage(text, 'user');
            inputField.value = '';
            conversationHistory.push({ role: 'user', text: text });

            var typingEl = showTyping();

            setTimeout(function() {
                removeTyping(typingEl);
                var resp = generateResponse(text);

                if (resp.text) {
                    addMessage(resp.text.replace(/\n/g, '<br>'), 'bot');
                }
                if (resp.venues && resp.venues.length) {
                    addVenueCards(resp.venues);
                }
                if (resp.followUp) {
                    setTimeout(function() {
                        addMessage('<span class="sl-tip">' + resp.followUp + '</span>', 'bot');
                    }, 400);
                }

                conversationHistory.push({ role: 'bot', text: resp.text });
            }, 600 + Math.random() * 400);
        }

        // Welcome message
        function showWelcome() {
            if (hasGreeted) return;
            hasGreeted = true;
            var ctx = getPageContext();
            addMessage(
                '<div class="sl-ctx-badge">Browsing: ' + ctx.page + '</div>' +
                'Welcome to <strong>SceneLink AI</strong>.<br><br>' +
                'I\'m your personal guide to the best restaurants, bars, events, and nightlife in Boston. Ask me anything or pick a suggestion below.',
                'bot'
            );
            addQuickActions(getQuickActions(ctx));
        }

        // Open / close
        function openPanel() {
            isOpen = true;
            // First make visible via inline style so the transition can fire
            panel.style.display = 'flex';
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(16px) scale(0.97)';
            // Double rAF to ensure browser registers the initial state before transitioning
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    panel.style.opacity = '';
                    panel.style.transform = '';
                    panel.classList.add('sl-panel-visible');
                });
            });
            fab.classList.add('sl-fab-open');
            showWelcome();
            setTimeout(function() { inputField.focus(); }, 350);
        }

        function closePanel() {
            isOpen = false;
            panel.classList.remove('sl-panel-visible');
            // Animate out by applying inline styles
            panel.style.opacity = '0';
            panel.style.transform = 'translateY(12px) scale(0.97)';
            fab.classList.remove('sl-fab-open');
            setTimeout(function() {
                if (!isOpen) {
                    panel.style.display = 'none';
                    panel.style.opacity = '';
                    panel.style.transform = '';
                }
            }, 300);
        }

        // Event Listeners — panel closes ONLY via close button, FAB toggle, or Escape
        fab.addEventListener('click', function(e) {
            e.stopPropagation();
            if (isOpen) closePanel(); else openPanel();
        });

        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closePanel();
        });

        panel.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isOpen) closePanel();
        });

        sendBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            handleUserMessage(inputField.value);
        });

        inputField.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleUserMessage(inputField.value);
            }
        });
    }

    /* ---- Global Action Handlers ---- */
    window.__slConciergeViewDetail = function(name) {
        var allVenues = restaurants.concat(nightlife);
        var v = allVenues.find(function(x) { return x.name === name; });
        if (!v) return;
        var hoursDisplay = v.hours || '';
        var msg = '<div style="padding:4px 0"><strong style="font-size:15px;color:#fff">' + v.name + '</strong>' +
            '<div style="color:#999;font-size:12px;margin:4px 0">' + (v.type || v.cuisine || '') + ' · ' + (v.neighborhood || '') + ' · ' + (v.price || '') + '</div>' +
            (v.desc ? '<div style="color:#bbb;font-size:13px;margin:8px 0;line-height:1.5">' + v.desc + '</div>' : '') +
            (v.address ? '<div style="color:#999;font-size:12px;margin:4px 0"><i class="fas fa-location-dot" style="color:#D4AF37;margin-right:4px"></i>' + v.address + '</div>' : '') +
            (hoursDisplay ? '<div style="color:#999;font-size:12px;margin:4px 0"><i class="fas fa-clock" style="color:#D4AF37;margin-right:4px"></i>' + hoursDisplay + '</div>' : '') +
            (v.phone ? '<div style="color:#999;font-size:12px;margin:4px 0"><i class="fas fa-phone" style="color:#D4AF37;margin-right:4px"></i>' + v.phone + '</div>' : '') +
            (v.rating ? '<div style="color:#D4AF37;font-size:13px;margin:8px 0;font-weight:600">★ ' + v.rating + (v.reviews ? ' · ' + v.reviews.toLocaleString() + ' reviews' : '') + '</div>' : '') +
            '</div>';
        addBotMessage(msg);
    };

    window.__slConciergePlanNight = function(name) {
        addBotMessage('Great choice! I\'ve started a plan for <strong style="color:#D4AF37">' + name + '</strong>. ' +
            '<div style="margin-top:8px">Would you like to:</div>' +
            '<div class="sl-concierge-quick-actions" style="margin-top:6px">' +
            '<button class="sl-quick-action" onclick="event.stopPropagation()">Invite friends</button>' +
            '<button class="sl-quick-action" onclick="event.stopPropagation()">Set time</button>' +
            '<button class="sl-quick-action" onclick="event.stopPropagation()">Add more venues</button>' +
            '</div>');
    };

    window.__slConciergeSave = function(btn, name) {
        var icon = btn.querySelector('i');
        if (btn.classList.contains('saved')) {
            btn.classList.remove('saved');
            if (icon) icon.className = 'fas fa-heart';
            addBotMessage('Removed <strong>' + name + '</strong> from your favorites.');
        } else {
            btn.classList.add('saved');
            if (icon) icon.className = 'fas fa-heart';
            addBotMessage('Saved <strong style="color:#D4AF37">' + name + '</strong> to your favorites! ❤️');
        }
    };

    /* ---- Initialize ---- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI);
    } else {
        buildUI();
    }
})();