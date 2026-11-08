// SceneLink Enhanced Concierge - Dark Theme & Fixed Recommendations
(function() {
    'use strict';

    // Enhanced Response System with Better Recommendation Updates
    class EnhancedConciergeResponses {
        constructor() {
            this.responseTemplates = {
                greetings: {
                    firstTime: [
                        "👋 Welcome to SceneLink! I'm your personal nightlife expert. What kind of vibe are you looking for tonight?",
                        "🌟 Hey there! I know all the best spots in Boston. What's your perfect night out?",
                        "🍸 Welcome! Let me help you discover something amazing. What are you in the mood for?"
                    ],
                    returning: [
                        "👋 Welcome back! Ready for another great night out?",
                        "🌟 Good to see you again! Let's find your next favorite spot.",
                        "🍸 Back for more? I've got some fresh recommendations for you!"
                    ],
                    contextual: {
                        'tonight-picks': "🌟 Perfect! You're on the Tonight's Picks page. Let me find something amazing for right now!",
                        'explore': "🗺️ Exploring Boston? I can help you discover hidden gems and popular spots.",
                        'nightlife': "🌃 Looking for nightlife? I know the best clubs, bars, and late-night destinations!",
                        'events': "🎭 Events page! Are you looking for something happening tonight or planning ahead?",
                        'home': "🏠 Welcome to SceneLink! Let's create your perfect night out."
                    }
                },
                recommendations: {
                    presenting: [
                        "Based on your preferences, here are my top recommendations:",
                        "I found some perfect matches for what you're looking for:",
                        "Here are the spots I think you'll absolutely love:",
                        "Perfect! I've curated some amazing options for you:"
                    ],
                    followUp: [
                        "Any of these catch your eye? I can tell you more or find similar spots!",
                        "What do you think? Want details about any specific venue?",
                        "See something you like? I can provide more info or adjust the search!",
                        "Which one interests you most? I can dive deeper or find alternatives!"
                    ],
                    noResults: [
                        "Let me broaden the search a bit. What's most important to you?",
                        "Those criteria are specific! Would you be open to adjusting slightly?",
                        "Let me think outside the box. What's your must-have versus nice-to-have?",
                        "I want to find you something perfect! What could we be flexible on?"
                    ]
                },
                refinements: {
                    cheaper: [
                        "Great call! Here are some amazing budget-friendly spots with great vibes:",
                        "Smart choice! These places offer incredible value without skimping on atmosphere:",
                        "Perfect! Here are some hidden gems that won't break the bank:"
                    ],
                    quieter: [
                        "I get it! Here are some perfect spots where you can actually have conversations:",
                        "Good call! These places have a more relaxed, intimate atmosphere:",
                        "Perfect! Here are some chill spots where the vibe is more laid-back:"
                    ],
                    livelier: [
                        "Let's turn up the energy! These spots are buzzing with amazing atmosphere:",
                        "You want the full experience! Here are some high-energy destinations:",
                        "Perfect! These spots have that electric energy you're looking for:"
                    ],
                    closer: [
                        "Let me find you something more convenient! Here are nearby spots:",
                        "Good thinking! Here are some great walkable options:",
                        "Perfect! These spots are much closer to you:"
                    ]
                }
            };
        }

        detectCurrentPage() {
            const path = window.location.pathname;
            if (path.includes('tonight-picks')) return 'tonight-picks';
            if (path.includes('explore')) return 'explore';
            if (path.includes('nightlife')) return 'nightlife';
            if (path.includes('events')) return 'events';
            if (path.includes('social-feed')) return 'social-feed';
            return 'home';
        }

        generateGreeting(isFirstTime, preferences) {
            const templates = this.responseTemplates.greetings;
            
            if (templates.contextual[this.detectCurrentPage()]) {
                const contextualGreeting = templates.contextual[this.detectCurrentPage()];
                const greetingArray = isFirstTime ? templates.firstTime : templates.returning;
                return greetingArray[0] + " " + contextualGreeting;
            }
            
            const greetingArray = isFirstTime ? templates.firstTime : templates.returning;
            return greetingArray[0];
        }

        extractPreferences(message) {
            const preferences = {};
            const extracted = [];
            
            const locations = ['downtown', 'back bay', 'cambridge', 'seaport', 'north end', 'south end', 'fenway', 'brookline'];
            const locationMatch = locations.find(loc => message.toLowerCase().includes(loc));
            if (locationMatch) {
                preferences.location = locationMatch;
                extracted.push({ type: 'location', value: locationMatch });
            }
            
            const vibes = {
                'energetic': ['energetic', 'lively', 'upbeat', 'party', 'dancing', 'music', 'nightclub'],
                'chill': ['chill', 'relaxed', 'laid back', 'quiet', 'calm', 'cozy', 'lounge'],
                'upscale': ['upscale', 'fancy', 'elegant', 'classy', 'nice', 'dressy', 'fine dining'],
                'casual': ['casual', 'relaxed', 'comfortable', 'informal', 'pub', 'bar'],
                'romantic': ['romantic', 'date', 'intimate', 'cozy', 'romance', 'dinner']
            };
            
            for (const [vibe, keywords] of Object.entries(vibes)) {
                if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
                    preferences.vibe = vibe;
                    extracted.push({ type: 'vibe', value: vibe });
                    break;
                }
            }
            
            const budgetKeywords = {
                'cheap': ['cheap', 'budget', 'affordable', 'inexpensive', 'under $20', 'happy hour'],
                'moderate': ['moderate', 'reasonable', 'mid-range', 'around $30', '$25-35'],
                'expensive': ['expensive', 'upscale', 'fancy', 'pricey', 'over $50', 'fine dining']
            };
            
            for (const [budget, keywords] of Object.entries(budgetKeywords)) {
                if (keywords.some(keyword => message.toLowerCase().includes(keyword))) {
                    preferences.budget = budget;
                    extracted.push({ type: 'budget', value: budget });
                    break;
                }
            }
            
            const groupMatch = message.match(/(\d+|a|two|three|four|five|six|seven|eight|nine|ten)\s*(people|person|friends|us)/i);
            if (groupMatch) {
                const numberMap = { 'a': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10 };
                const size = numberMap[groupMatch[1].toLowerCase()] || parseInt(groupMatch[1]);
                if (size && size > 0) {
                    preferences.groupSize = size;
                    extracted.push({ type: 'groupSize', value: size });
                }
            }
            
            const occasions = ['date', 'birthday', 'anniversary', 'celebration', 'after work', 'weekend', 'weeknight', 'dinner'];
            const occasionMatch = occasions.find(occ => message.toLowerCase().includes(occ));
            if (occasionMatch) {
                preferences.occasion = occasionMatch;
                extracted.push({ type: 'occasion', value: occasionMatch });
            }
            
            return { preferences, extracted };
        }

        handleRefinement(message, currentRecommendations) {
            const messageLower = message.toLowerCase();
            
            if (messageLower.includes('cheaper') || messageLower.includes('less expensive') || messageLower.includes('budget') || messageLower.includes('affordable')) {
                return 'cheaper';
            } else if (messageLower.includes('quieter') || messageLower.includes('less loud') || messageLower.includes('calmer') || messageLower.includes('relaxed')) {
                return 'quieter';
            } else if (messageLower.includes('livelier') || messageLower.includes('more energy') || messageLower.includes('busier') || messageLower.includes('energetic')) {
                return 'livelier';
            } else if (messageLower.includes('closer') || messageLower.includes('nearer') || messageLower.includes('walkable') || messageLower.includes('nearby')) {
                return 'closer';
            }
            
            return null;
        }

        generateRecommendationResponse(venues) {
            const templates = this.responseTemplates.recommendations;
            const presentingTemplate = templates.presenting[Math.floor(Math.random() * templates.presenting.length)];
            const followUpTemplate = templates.followUp[Math.floor(Math.random() * templates.followUp.length)];
            
            return {
                message: presentingTemplate,
                venues: venues,
                followUp: followUpTemplate
            };
        }

        generateRefinementResponse(refinementType, venues) {
            const templates = this.responseTemplates.refinements[refinementType];
            if (templates) {
                const template = templates[Math.floor(Math.random() * templates.length)];
                return {
                    message: template,
                    venues: venues,
                    refined: true
                };
            }
            return null;
        }
    }

    // Enhanced Mock Venues with More Variety
    const mockVenues = [
        {
            id: 'venue-1',
            name: 'The Grand Cocktail Lounge',
            description: 'An elegant rooftop lounge with panoramic city views, craft cocktails, and live jazz music every weekend. Perfect for special occasions.',
            image: 'https://picsum.photos/seed/grand-lounge/400/300.jpg',
            neighborhood: 'Back Bay',
            rating: 4.8,
            reviewCount: 324,
            priceRange: '$$$$',
            tags: ['Upscale', 'Cocktails', 'Rooftop', 'Live Music', 'Romantic'],
            hours: '5PM - 2AM',
            trending: true,
            crowd: 'Sophisticated',
            music: 'Jazz',
            reservations: 'Recommended'
        },
        {
            id: 'venue-2',
            name: 'Neon Nights Dance Club',
            description: 'High-energy nightclub with top DJs, VIP bottle service, and state-of-the-art sound system. The ultimate party destination.',
            image: 'https://picsum.photos/seed/neon-nights/400/300.jpg',
            neighborhood: 'Downtown',
            rating: 4.6,
            reviewCount: 567,
            priceRange: '$$$',
            tags: ['Nightclub', 'Dancing', 'VIP', 'Electronic', 'High Energy'],
            hours: '10PM - 4AM',
            crowd: 'Energetic',
            music: 'EDM/Top 40',
            reservations: 'Required for VIP'
        },
        {
            id: 'venue-3',
            name: 'The Cozy Corner Pub',
            description: 'Intimate neighborhood pub with craft beers, comfort food, and a welcoming fireplace atmosphere. Your local favorite.',
            image: 'https://picsum.photos/seed/cozy-pub/400/300.jpg',
            neighborhood: 'Cambridge',
            rating: 4.5,
            reviewCount: 189,
            priceRange: '$$',
            tags: ['Casual', 'Pub', 'Craft Beer', 'Cozy', 'Relaxed'],
            hours: '4PM - 1AM',
            crowd: 'Casual',
            music: 'Rock/Indie',
            reservations: 'Not needed'
        },
        {
            id: 'venue-4',
            name: 'Skyline Restaurant & Bar',
            description: 'Modern fine dining with stunning views, innovative cuisine, and an extensive wine selection. Boston culinary excellence.',
            image: 'https://picsum.photos/seed/skyline-restaurant/400/300.jpg',
            neighborhood: 'Seaport',
            rating: 4.9,
            reviewCount: 412,
            priceRange: '$$$$',
            tags: ['Fine Dining', 'Romantic', 'Wine Bar', 'Views', 'Upscale'],
            hours: '6PM - 11PM',
            crowd: 'Upscale',
            music: 'Ambient',
            reservations: 'Essential'
        },
        {
            id: 'venue-5',
            name: 'The Underground Music Hall',
            description: 'Intimate live music venue featuring local bands, craft cocktails, and a vintage vinyl collection. Music lover paradise.',
            image: 'https://picsum.photos/seed/underground-hall/400/300.jpg',
            neighborhood: 'North End',
            rating: 4.7,
            reviewCount: 234,
            priceRange: '$$',
            tags: ['Live Music', 'Intimate', 'Craft Cocktails', 'Vintage', 'Chill'],
            hours: '7PM - 2AM',
            crowd: 'Music Lovers',
            music: 'Live Bands',
            reservations: 'Recommended weekends'
        },
        {
            id: 'venue-6',
            name: 'Rooftop Garden Bar',
            description: 'Beautiful outdoor garden setting with fire pits, seasonal cocktails, and city skyline views. Perfect for summer nights.',
            image: 'https://picsum.photos/seed/rooftop-garden/400/300.jpg',
            neighborhood: 'Fenway',
            rating: 4.4,
            reviewCount: 298,
            priceRange: '$$',
            tags: ['Outdoor', 'Rooftop', 'Garden', 'Seasonal', 'Casual'],
            hours: '4PM - 12AM',
            crowd: 'Mixed',
            music: 'Pop/Lounge',
            reservations: 'Recommended'
        },
        {
            id: 'venue-7',
            name: 'BrewDog Craft Beer Hall',
            description: 'Massive craft beer selection with industrial-chic decor, pub food, and weekly brewery events. Beer enthusiast heaven.',
            image: 'https://picsum.photos/seed/brewdog-hall/400/300.jpg',
            neighborhood: 'South End',
            rating: 4.3,
            reviewCount: 445,
            priceRange: '$$',
            tags: ['Craft Beer', 'Pub', 'Casual', 'Social', 'Lively'],
            hours: '12PM - 1AM',
            crowd: 'Casual/Social',
            music: 'Rock',
            reservations: 'Large groups'
        },
        {
            id: 'venue-8',
            name: 'The Speakeasy Jazz Club',
            description: 'Hidden underground jazz club with Prohibition-era decor, craft cocktails, and world-class musicians. Secret gem.',
            image: 'https://picsum.photos/seed/speakeasy-jazz/400/300.jpg',
            neighborhood: 'Back Bay',
            rating: 4.8,
            reviewCount: 167,
            priceRange: '$$$',
            tags: ['Jazz', 'Speakeasy', 'Cocktails', 'Intimate', 'Upscale'],
            hours: '8PM - 2AM',
            crowd: 'Sophisticated',
            music: 'Live Jazz',
            reservations: 'Essential'
        }
    ];

    // Enhanced Dark-Themed Venue Cards
    class DarkVenueCards {
        constructor() {
            this.styles = `
                .enhanced-venue-card {
                    background: linear-gradient(135deg, var(--dark-card) 0%, var(--dark-elevated) 100%);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    margin-bottom: 16px;
                    overflow: hidden;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    cursor: pointer;
                    position: relative;
                    animation: slideInUp 0.6s ease-out forwards;
                    opacity: 0;
                    border: 1px solid var(--border-color);
                }

                .enhanced-venue-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
                    border-color: var(--gold-primary);
                }

                .enhanced-venue-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 4px;
                    background: linear-gradient(90deg, var(--gold-primary), var(--gold-light), var(--gold-primary));
                    transform: scaleX(0);
                    transition: transform 0.3s ease;
                }

                .enhanced-venue-card:hover::before {
                    transform: scaleX(1);
                }

                @keyframes slideInUp {
                    from {
                        transform: translateY(30px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .venue-card-image-container {
                    position: relative;
                    height: 200px;
                    overflow: hidden;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }

                .venue-card-image {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.6s ease;
                }

                .enhanced-venue-card:hover .venue-card-image {
                    transform: scale(1.1);
                }

                .venue-card-content {
                    padding: 20px;
                    background: var(--dark-card);
                }

                .venue-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: start;
                    margin-bottom: 12px;
                }

                .venue-card-name {
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 4px;
                    line-height: 1.2;
                }

                .venue-card-neighborhood {
                    font-size: 14px;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .venue-card-rating {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-bottom: 8px;
                }

                .venue-card-actions {
                    display: flex;
                    gap: 8px;
                }

                .venue-action-btn {
                    flex: 1;
                    padding: 12px 16px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-align: center;
                    font-size: 14px;
                }

                .venue-action-btn.primary {
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    color: var(--dark-bg);
                }

                .venue-action-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3);
                }

                .venue-action-btn.secondary {
                    background: var(--dark-lighter);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                }

                .venue-action-btn.secondary:hover {
                    background: var(--dark-elevated);
                    transform: translateY(-1px);
                }

                .venue-card-quick-actions {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    display: flex;
                    gap: 8px;
                    z-index: 2;
                }

                .venue-quick-action {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: rgba(26, 26, 26, 0.9);
                    backdrop-filter: blur(10px);
                    border: 1px solid var(--border-color);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }

                .venue-quick-action:hover {
                    transform: scale(1.1);
                    background: var(--gold-primary);
                    color: var(--dark-bg);
                }

                .venue-quick-action.liked {
                    background: var(--error);
                    color: white;
                }

                .venue-live-indicator {
                    position: absolute;
                    top: 12px;
                    left: 12px;
                    background: var(--error);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    backdrop-filter: blur(10px);
                }

                .live-pulse {
                    width: 8px;
                    height: 8px;
                    background: white;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .venue-trending-badge {
                    position: absolute;
                    bottom: 12px;
                    left: 12px;
                    background: var(--warning);
                    color: var(--dark-bg);
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    backdrop-filter: blur(10px);
                }

                .venue-card-description {
                    color: var(--text-secondary);
                    font-size: 14px;
                    line-height: 1.5;
                    margin-bottom: 12px;
                }

                .venue-card-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 16px;
                }

                .venue-tag {
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    color: var(--dark-bg);
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                }

                .venue-card-meta {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 16px;
                    padding: 12px 0;
                    border-top: 1px solid var(--border-color);
                    border-bottom: 1px solid var(--border-color);
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--text-muted);
                    font-size: 13px;
                }

                .meta-item svg {
                    stroke: var(--gold-primary);
                }
            `;
            
            this.injectStyles();
        }

        injectStyles() {
            if (!document.getElementById('dark-venue-cards-styles')) {
                const style = document.createElement('style');
                style.id = 'dark-venue-cards-styles';
                style.innerHTML = this.styles;
                document.head.appendChild(style);
            }
        }

        isVenueLiked(venueId) {
            const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
            return savedVenues.includes(venueId);
        }

        isVenueLive(venue) {
            const currentHour = new Date().getHours();
            const liveVenues = ['venue-1', 'venue-3', 'venue-5'];
            return liveVenues.includes(venue.id) && currentHour >= 18 && currentHour <= 23;
        }

        toggleSave(venueId, event) {
            event.stopPropagation();
            
            const savedVenues = JSON.parse(localStorage.getItem('savedVenues') || '[]');
            const button = event.currentTarget;
            const isCurrentlySaved = savedVenues.includes(venueId);
            
            if (isCurrentlySaved) {
                const index = savedVenues.indexOf(venueId);
                savedVenues.splice(index, 1);
                button.classList.remove('liked');
            } else {
                savedVenues.push(venueId);
                button.classList.add('liked');
            }
            
            localStorage.setItem('savedVenues', JSON.stringify(savedVenues));
        }

        viewDetails(venueId) {
            window.location.href = `venue-details-enhanced.html?id=${venueId}`;
        }

        makeReservation(venueId) {
            window.location.href = `venue-details-enhanced.html?id=${venueId}#booking`;
        }

        shareVenue(venueId, event) {
            event.stopPropagation();
            const venue = mockVenues.find(v => v.id === venueId);
            if (venue) {
                const shareText = `Check out ${venue.name} - ${venue.description}`;
                if (navigator.share) {
                    navigator.share({
                        title: venue.name,
                        text: shareText,
                        url: window.location.href
                    });
                } else {
                    navigator.clipboard.writeText(`${shareText} ${window.location.href}`);
                }
            }
        }

        createVenueCard(venue, index = 0) {
            const isLiked = this.isVenueLiked(venue.id);
            const isLive = this.isVenueLive(venue);
            
            return `
                <div class="enhanced-venue-card" data-venue-id="${venue.id}" style="animation-delay: ${index * 0.1}s">
                    <div class="venue-card-image-container">
                        <img src="${venue.image}" alt="${venue.name}" class="venue-card-image">
                        
                        <div class="venue-card-quick-actions">
                            <button class="venue-quick-action save-btn ${isLiked ? 'liked' : ''}" onclick="window.darkConcierge.venueCards.toggleSave('${venue.id}', event)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                </svg>
                            </button>
                            <button class="venue-quick-action share-btn" onclick="window.darkConcierge.venueCards.shareVenue('${venue.id}', event)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                            </button>
                        </div>
                        
                        ${isLive ? `
                            <div class="venue-live-indicator">
                                <span class="live-pulse"></span>
                                LIVE NOW
                            </div>
                        ` : ''}
                        
                        ${venue.trending ? `
                            <div class="venue-trending-badge">
                                🔥 Trending
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="venue-card-content">
                        <div class="venue-card-header">
                            <div>
                                <h3 class="venue-card-name">${venue.name}</h3>
                                <div class="venue-card-neighborhood">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    ${venue.neighborhood}
                                </div>
                            </div>
                            
                            <div class="venue-card-rating">
                                <div style="color: var(--gold-primary); font-size: 16px;">★</div>
                                <span style="font-weight: 600; color: var(--text-primary); font-size: 14px;">${venue.rating}</span>
                                <span style="color: var(--text-muted); font-size: 12px;">(${venue.reviewCount})</span>
                            </div>
                        </div>
                        
                        <div class="venue-card-description">
                            ${venue.description}
                        </div>
                        
                        <div class="venue-card-tags">
                            ${venue.tags.map(tag => `
                                <span class="venue-tag">${tag}</span>
                            `).join('')}
                        </div>
                        
                        <div class="venue-card-meta">
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="1" x2="12" y2="23"></line>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                                ${venue.priceRange}
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                ${venue.hours}
                            </div>
                            <div class="meta-item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                ${venue.crowd}
                            </div>
                        </div>
                        
                        <div class="venue-card-actions">
                            <button class="venue-action-btn primary" onclick="window.darkConcierge.venueCards.viewDetails('${venue.id}')">
                                View Details
                            </button>
                            <button class="venue-action-btn secondary" onclick="window.darkConcierge.venueCards.makeReservation('${venue.id}')">
                                Reserve
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        renderVenues(venues, containerId = 'concierge-venues-container') {
            let container = document.getElementById(containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = containerId;
                const messageContainer = document.querySelector('.concierge-messages');
                if (messageContainer) {
                    messageContainer.appendChild(container);
                }
            }
            
            container.innerHTML = '';
            
            venues.forEach((venue, index) => {
                const cardHTML = this.createVenueCard(venue, index);
                container.innerHTML += cardHTML;
            });
            
            container.querySelectorAll('.enhanced-venue-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.venue-quick-action') || e.target.closest('.venue-action-btn')) {
                        return;
                    }
                    const venueId = card.dataset.venueId;
                    this.viewDetails(venueId);
                });
            });
        }
    }

    // Dark Theme Enhanced Concierge Integration
    class DarkConciergeIntegration {
        constructor() {
            this.responseSystem = new EnhancedConciergeResponses();
            this.venueCards = new DarkVenueCards();
            this.conversationState = {
                stage: 'greeting',
                userPreferences: {},
                currentRecommendations: [],
                lastUserMessage: null,
                conversationCount: 0
            };
            
            this.init();
        }

        init() {
            this.createDarkConciergeWidget();
            this.attachEventListeners();
            this.loadUserPreferences();
        }

        createDarkConciergeWidget() {
            const floatingButton = document.createElement('div');
            floatingButton.id = 'dark-concierge-button';
            floatingButton.innerHTML = `
                <div class="concierge-button-content">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                        <circle cx="8" cy="10" r="1" fill="#0a0a0a"/>
                        <circle cx="12" cy="10" r="1" fill="#0a0a0a"/>
                        <circle cx="16" cy="10" r="1" fill="#0a0a0a"/>
                    </svg>
                    <span class="concierge-tooltip">Ask SceneLink Concierge</span>
                </div>
                <div class="pulse-ring"></div>
            `;

            const chatPanel = document.createElement('div');
            chatPanel.id = 'dark-concierge-panel';
            chatPanel.innerHTML = `
                <div class="concierge-header">
                    <div class="concierge-branding">
                        <div class="concierge-logo">🌟</div>
                        <div class="concierge-title-section">
                            <h3>SceneLink Concierge</h3>
                            <p>Your personal nightlife expert</p>
                        </div>
                    </div>
                    <button class="concierge-close" onclick="window.darkConcierge.hidePanel()">×</button>
                </div>
                
                <div class="concierge-messages" id="concierge-messages">
                </div>
                
                <div class="concierge-input-section">
                    <div class="quick-actions" id="quick-actions">
                        <button class="quick-action-chip" onclick="window.darkConcierge.quickAction('date-night')">
                            💕 Date night spot
                        </button>
                        <button class="quick-action-chip" onclick="window.darkConcierge.quickAction('cocktail-bars')">
                            🍸 Cocktail bars
                        </button>
                        <button class="quick-action-chip" onclick="window.darkConcierge.quickAction('group-hang')">
                            🎉 Group hang
                        </button>
                        <button class="quick-action-chip" onclick="window.darkConcierge.quickAction('tonight')">
                            🌟 Tonight's picks
                        </button>
                    </div>
                    
                    <div class="input-container">
                        <input type="text" id="concierge-input" placeholder="What are you looking for tonight?" />
                        <button id="concierge-send" onclick="window.darkConcierge.sendMessage()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            this.addDarkStyles();
            
            document.body.appendChild(floatingButton);
            document.body.appendChild(chatPanel);
            
            setTimeout(() => {
                this.showGreeting();
            }, 1000);
        }

        addDarkStyles() {
            if (document.getElementById('dark-concierge-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'dark-concierge-styles';
            styles.innerHTML = `
                #dark-concierge-button {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    border-radius: 50%;
                    cursor: pointer;
                    z-index: 9999;
                    box-shadow: 0 8px 32px rgba(212, 175, 55, 0.3);
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                #dark-concierge-button:hover {
                    transform: scale(1.1);
                    box-shadow: 0 12px 40px rgba(212, 175, 55, 0.4);
                }

                #dark-concierge-button:hover .concierge-tooltip {
                    opacity: 1;
                    transform: translateX(-10px);
                }

                .concierge-tooltip {
                    position: absolute;
                    right: 80px;
                    background: var(--dark-elevated);
                    color: var(--text-primary);
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    white-space: nowrap;
                    opacity: 0;
                    transition: all 0.3s ease;
                    pointer-events: none;
                    border: 1px solid var(--border-color);
                }

                .concierge-tooltip::after {
                    content: '';
                    position: absolute;
                    right: -6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 0;
                    height: 0;
                    border-left: 6px solid var(--dark-elevated);
                    border-top: 6px solid transparent;
                    border-bottom: 6px solid transparent;
                }

                .pulse-ring {
                    position: absolute;
                    top: -4px;
                    left: -4px;
                    width: 72px;
                    height: 72px;
                    border: 2px solid var(--gold-primary);
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                    opacity: 0;
                }

                @keyframes pulse {
                    0% {
                        transform: scale(1);
                        opacity: 0.6;
                    }
                    50% {
                        transform: scale(1.2);
                        opacity: 0;
                    }
                    100% {
                        transform: scale(1);
                        opacity: 0;
                    }
                }

                #dark-concierge-panel {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    width: 420px;
                    max-width: 90vw;
                    height: 600px;
                    background: var(--dark-card);
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    z-index: 10000;
                    display: flex;
                    flex-direction: column;
                    transform: translateY(120%);
                    opacity: 0;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    border: 1px solid var(--border-color);
                }

                #dark-concierge-panel.active {
                    transform: translateY(0);
                    opacity: 1;
                }

                .concierge-header {
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    color: var(--dark-bg);
                    padding: 20px;
                    border-radius: 20px 20px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .concierge-branding {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .concierge-logo {
                    width: 40px;
                    height: 40px;
                    background: white;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                }

                .concierge-title-section h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                }

                .concierge-title-section p {
                    margin: 0;
                    font-size: 14px;
                    opacity: 0.9;
                }

                .concierge-close {
                    background: none;
                    border: none;
                    color: var(--dark-bg);
                    font-size: 24px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.3s ease;
                }

                .concierge-close:hover {
                    background: rgba(0, 0, 0, 0.2);
                }

                .concierge-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    background: var(--dark-card);
                }

                .message {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 18px;
                    font-size: 14px;
                    line-height: 1.4;
                    animation: messageSlide 0.3s ease-out;
                }

                @keyframes messageSlide {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .message.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    color: var(--dark-bg);
                }

                .message.ai {
                    align-self: flex-start;
                    background: var(--dark-lighter);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                }

                .typing-indicator {
                    display: flex;
                    gap: 4px;
                    padding: 12px 16px;
                    background: var(--dark-lighter);
                    border-radius: 18px;
                    width: fit-content;
                    border: 1px solid var(--border-color);
                }

                .typing-dot {
                    width: 8px;
                    height: 8px;
                    background: var(--gold-primary);
                    border-radius: 50%;
                    animation: typing 1.4s infinite;
                }

                .typing-dot:nth-child(2) {
                    animation-delay: 0.2s;
                }

                .typing-dot:nth-child(3) {
                    animation-delay: 0.4s;
                }

                @keyframes typing {
                    0%, 60%, 100% {
                        transform: translateY(0);
                    }
                    30% {
                        transform: translateY(-10px);
                    }
                }

                .concierge-input-section {
                    padding: 20px;
                    border-top: 1px solid var(--border-color);
                    background: var(--dark-card);
                }

                .quick-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .quick-action-chip {
                    padding: 8px 16px;
                    background: var(--dark-lighter);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    font-size: 13px;
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .quick-action-chip:hover {
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    border-color: var(--gold-primary);
                    color: var(--dark-bg);
                    transform: translateY(-2px);
                }

                .input-container {
                    display: flex;
                    gap: 8px;
                }

                #concierge-input {
                    flex: 1;
                    padding: 12px 16px;
                    border: 1px solid var(--border-color);
                    border-radius: 25px;
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.3s ease;
                    background: var(--dark-lighter);
                    color: var(--text-primary);
                }

                #concierge-input:focus {
                    border-color: var(--gold-primary);
                }

                #concierge-input::placeholder {
                    color: var(--text-muted);
                }

                #concierge-send {
                    width: 44px;
                    height: 44px;
                    background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-light) 100%);
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.3s ease;
                }

                #concierge-send:hover {
                    transform: scale(1.1);
                }

                @media (max-width: 480px) {
                    #dark-concierge-panel {
                        width: 100vw;
                        height: 100vh;
                        bottom: 0;
                        right: 0;
                        border-radius: 0;
                    }

                    .concierge-header {
                        border-radius: 0;
                    }

                    .quick-actions {
                        justify-content: center;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }

        attachEventListeners() {
            document.getElementById('dark-concierge-button').addEventListener('click', () => {
                this.showPanel();
            });

            document.getElementById('concierge-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hidePanel();
                }
            });

            document.addEventListener('click', (e) => {
                const panel = document.getElementById('dark-concierge-panel');
                const button = document.getElementById('dark-concierge-button');
                
                if (panel.classList.contains('active') && 
                    !panel.contains(e.target) && 
                    !button.contains(e.target)) {
                    this.hidePanel();
                }
            });
        }

        showPanel() {
            document.getElementById('dark-concierge-panel').classList.add('active');
            document.getElementById('concierge-input').focus();
            
            setTimeout(() => {
                document.getElementById('dark-concierge-button').style.display = 'none';
            }, 300);
        }

        hidePanel() {
            document.getElementById('dark-concierge-panel').classList.remove('active');
            
            setTimeout(() => {
                document.getElementById('dark-concierge-button').style.display = 'flex';
            }, 300);
        }

        loadUserPreferences() {
            const saved = localStorage.getItem('conciergePreferences');
            if (saved) {
                this.conversationState.userPreferences = JSON.parse(saved);
            }
        }

        saveUserPreferences() {
            localStorage.setItem('conciergePreferences', JSON.stringify(this.conversationState.userPreferences));
        }

        showGreeting() {
            const isFirstTime = !localStorage.getItem('conciergeVisited');
            const greeting = this.responseSystem.generateGreeting(isFirstTime, this.conversationState.userPreferences);
            
            this.addMessage(greeting, 'ai');
            
            if (isFirstTime) {
                localStorage.setItem('conciergeVisited', 'true');
            }
        }

        quickAction(action) {
            const actions = {
                'date-night': "I'm looking for a romantic spot for a date night. Something intimate with good ambiance.",
                'cocktail-bars': "Show me the best cocktail bars in Boston. I want craft cocktails and a sophisticated atmosphere.",
                'group-hang': "I need a good spot for a group hangout. We're 4-6 people looking for a fun, casual atmosphere.",
                'tonight': "What are the best places to go tonight? Show me what's happening right now."
            };

            const message = actions[action];
            document.getElementById('concierge-input').value = message;
            this.sendMessage();
        }

        sendMessage() {
            const input = document.getElementById('concierge-input');
            const message = input.value.trim();
            
            if (!message) return;

            this.addMessage(message, 'user');
            this.conversationState.lastUserMessage = message;
            this.conversationState.conversationCount++;
            input.value = '';

            this.showTypingIndicator();

            setTimeout(() => {
                this.processMessage(message);
            }, 1000);
        }

        showTypingIndicator() {
            const typingHTML = `
                <div class="typing-indicator" id="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            
            const messagesContainer = document.getElementById('concierge-messages');
            messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        hideTypingIndicator() {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) {
                indicator.remove();
            }
        }

        processMessage(message) {
            this.hideTypingIndicator();

            const { preferences, extracted } = this.responseSystem.extractPreferences(message);
            
            Object.assign(this.conversationState.userPreferences, preferences);
            this.saveUserPreferences();

            // Clear previous venues if this is a new search (not a refinement)
            if (!this.responseSystem.handleRefinement(message, this.conversationState.currentRecommendations)) {
                this.clearPreviousVenues();
            }

            if (this.conversationState.currentRecommendations.length > 0) {
                const refinementType = this.responseSystem.handleRefinement(message, this.conversationState.currentRecommendations);
                
                if (refinementType) {
                    this.handleRefinement(refinementType, message);
                    return;
                }
            }

            this.generateRecommendations(preferences, extracted);
        }

        clearPreviousVenues() {
            const existingContainer = document.getElementById('concierge-venues-container');
            if (existingContainer) {
                existingContainer.remove();
            }
            this.conversationState.currentRecommendations = [];
        }

        generateRecommendations(preferences, extracted) {
            let venues = [...mockVenues];

            // Apply filters based on preferences
            if (preferences.location) {
                venues = venues.filter(v => 
                    v.neighborhood.toLowerCase().includes(preferences.location.toLowerCase())
                );
            }

            if (preferences.vibe) {
                venues = venues.filter(v => 
                    v.tags.some(tag => tag.toLowerCase().includes(preferences.vibe.toLowerCase())) ||
                    v.description.toLowerCase().includes(preferences.vibe.toLowerCase())
                );
            }

            if (preferences.budget) {
                const budgetMap = {
                    'cheap': ['$', '$$'],
                    'moderate': ['$$', '$$$'],
                    'expensive': ['$$$', '$$$$']
                };
                
                const allowedRanges = budgetMap[preferences.budget] || ['$$', '$$$'];
                venues = venues.filter(v => allowedRanges.some(range => v.priceRange.includes(range)));
            }

            if (preferences.occasion === 'date' || preferences.vibe === 'romantic') {
                venues = venues.filter(v => 
                    v.tags.includes('Romantic') || v.tags.includes('Upscale') || v.tags.includes('Intimate')
                );
            }

            if (preferences.groupSize && preferences.groupSize > 6) {
                venues = venues.filter(v => v.tags.includes('Social') || v.reservations === 'Large groups');
            }

            // Sort by rating and add some randomness for variety
            venues.sort((a, b) => b.rating - a.rating);
            
            // Add variety based on conversation count
            if (this.conversationState.conversationCount > 2) {
                venues = venues.sort(() => Math.random() - 0.5);
            }

            venues = venues.slice(0, 4);

            if (venues.length === 0) {
                const noResultsMessage = this.responseSystem.responseTemplates.recommendations.noResults[0];
                this.addMessage(noResultsMessage, 'ai');
                return;
            }

            const response = this.responseSystem.generateRecommendationResponse(venues);
            this.conversationState.currentRecommendations = venues;

            this.addMessage(response.message, 'ai');
            this.venueCards.renderVenues(venues);

            setTimeout(() => {
                this.addMessage(response.followUp, 'ai');
            }, 500);
        }

        handleRefinement(refinementType, message) {
            let refinedVenues = [...this.conversationState.currentRecommendations];

            switch (refinementType) {
                case 'cheaper':
                    refinedVenues = refinedVenues.filter(v => v.priceRange === '$' || v.priceRange === '$$');
                    break;
                case 'quieter':
                    refinedVenues = refinedVenues.filter(v => 
                        v.tags.includes('Cozy') || v.tags.includes('Intimate') || v.tags.includes('Chill')
                    );
                    break;
                case 'livelier':
                    refinedVenues = refinedVenues.filter(v => 
                        v.tags.includes('Nightclub') || v.tags.includes('Dancing') || v.tags.includes('High Energy')
                    );
                    break;
                case 'closer':
                    // In real app, this would use user location
                    refinedVenues = refinedVenues.slice(0, 2);
                    break;
            }

            // Clear previous venues and show new ones
            this.clearPreviousVenues();

            const response = this.responseSystem.generateRefinementResponse(refinementType, refinedVenues);
            
            if (response && refinedVenues.length > 0) {
                this.addMessage(response.message, 'ai');
                this.conversationState.currentRecommendations = refinedVenues;
                this.venueCards.renderVenues(refinedVenues);
                
                setTimeout(() => {
                    this.addMessage("How do these look? Better fit for what you're looking for?", 'ai');
                }, 500);
            } else {
                this.addMessage("I couldn't find any venues that match that refinement. Let me try a different approach...", 'ai');
                setTimeout(() => {
                    this.generateRecommendations({}, []);
                }, 1500);
            }
        }

        addMessage(text, sender) {
            const messagesContainer = document.getElementById('concierge-messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}`;
            messageDiv.textContent = text;
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // Initialize the dark concierge
    window.darkConcierge = new DarkConciergeIntegration();

})();