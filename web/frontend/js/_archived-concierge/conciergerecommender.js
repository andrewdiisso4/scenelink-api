/**
 * SceneLink Concierge Recommender Engine
 * Filters and ranks venues based on user preferences
 */

class SceneLinkConciergeRecommender {
    constructor() {
        this.venues = window.mockVenues || [];
        this.weights = {
            vibe: 0.3,
            price: 0.25,
            location: 0.2,
            groupSize: 0.15,
            rating: 0.1
        };
    }

    // ============================================
    // MAIN RECOMMENDATION METHOD
    // ============================================

    recommend(preferences, options = {}) {
        const {
            limit = 5,
            excludeIds = [],
            flexible = false,
            sortBy = 'score' // score, rating, price, name
        } = options;

        // Filter venues
        let filteredVenues = this.filterVenues(preferences, excludeIds, flexible);

        // Score remaining venues
        const scoredVenues = this.scoreVenues(filteredVenues, preferences);

        // Sort venues
        const sortedVenues = this.sortVenues(scoredVenues, sortBy);

        // Return limited results
        return sortedVenues.slice(0, limit);
    }

    // ============================================
    // VENUE FILTERING
    // ============================================

    filterVenues(preferences, excludeIds = [], flexible = false) {
        let filtered = this.venues.filter(venue => 
            !excludeIds.includes(venue.id)
        );

        // Hard filters (always applied)
        if (preferences.vibe && !flexible) {
            filtered = filtered.filter(venue => venue.vibe === preferences.vibe);
        }

        if (preferences.price && !flexible) {
            filtered = filtered.filter(venue => venue.price === preferences.price);
        }

        if (preferences.neighborhood && !flexible) {
            filtered = filtered.filter(venue => 
                venue.neighborhood.toLowerCase().includes(preferences.neighborhood.toLowerCase())
            );
        }

        // Soft filters for flexible mode
        if (flexible) {
            filtered = this.applySoftFilters(filtered, preferences);
        }

        // Group size filtering
        if (preferences.groupSize) {
            filtered = this.filterByGroupSize(filtered, preferences.groupSize);
        }

        return filtered;
    }

    applySoftFilters(venues, preferences) {
        // Score venues based on soft match with preferences
        return venues.map(venue => {
            let softScore = 1.0;

            // Vibe soft match
            if (preferences.vibe && venue.vibe !== preferences.vibe) {
                // Check if venue tags contain related terms
                const vibeTerms = this.getVibeTerms(preferences.vibe);
                const hasRelatedTerms = venue.tags.some(tag => 
                    vibeTerms.some(term => tag.toLowerCase().includes(term))
                );
                
                if (!hasRelatedTerms) {
                    softScore *= 0.7; // Penalty for vibe mismatch
                }
            }

            // Price soft match (allow one level difference)
            if (preferences.price) {
                const priceLevels = ['$', '$$', '$$$'];
                const userLevel = priceLevels.indexOf(preferences.price);
                const venueLevel = priceLevels.indexOf(venue.price);
                const levelDiff = Math.abs(userLevel - venueLevel);
                
                if (levelDiff > 1) {
                    softScore *= 0.6; // Heavy penalty for big price difference
                } else if (levelDiff === 1) {
                    softScore *= 0.85; // Small penalty for one level difference
                }
            }

            // Location soft match (prefer same area, allow nearby)
            if (preferences.neighborhood) {
                const sameNeighborhood = venue.neighborhood.toLowerCase().includes(preferences.neighborhood.toLowerCase());
                if (!sameNeighborhood) {
                    softScore *= 0.8; // Penalty for location mismatch
                }
            }

            return {
                ...venue,
                softScore
            };
        }).filter(venue => venue.softScore >= 0.6); // Filter out poorly matching venues
    }

    filterByGroupSize(venues, groupSize) {
        // Different venue types work better for different group sizes
        const groupSizeRules = {
            '1-2': (venue) => venue.tags.includes('Date Night') || venue.tags.includes('Intimate'),
            '3-4': (venue) => !venue.tags.includes('Solo') && !venue.tags.includes('Intimate Only'),
            '5-8': (venue) => venue.tags.includes('Group Hang') || venue.tags.includes('Events') || venue.tags.includes('Group Seating'),
            '9+': (venue) => venue.tags.includes('Events') || venue.tags.includes('Large Group') || venue.tags.includes('Private Events')
        };

        const rule = groupSizeRules[groupSize];
        
        if (!rule) {
            return venues; // No specific rule, return all
        }

        // Return venues that match the rule, but if none do, return all as fallback
        const matched = venues.filter(rule);
        return matched.length > 0 ? matched : venues;
    }

    // ============================================
    // VENUE SCORING
    // ============================================

    scoreVenues(venues, preferences) {
        return venues.map(venue => {
            let score = 0;

            // Vibe matching
            if (preferences.vibe && venue.vibe === preferences.vibe) {
                score += this.weights.vibe;
            }

            // Price matching
            if (preferences.price && venue.price === preferences.price) {
                score += this.weights.price;
            }

            // Location matching
            if (preferences.neighborhood && 
                venue.neighborhood.toLowerCase().includes(preferences.neighborhood.toLowerCase())) {
                score += this.weights.location;
            }

            // Group size compatibility
            if (preferences.groupSize) {
                const compatible = this.isGroupSizeCompatible(venue, preferences.groupSize);
                if (compatible) {
                    score += this.weights.groupSize;
                }
            }

            // Rating bonus
            score += (venue.rating / 5) * this.weights.rating;

            // Soft score bonus (if available from flexible filtering)
            if (venue.softScore) {
                score *= venue.softScore;
            }

            // Tag matching bonus
            if (preferences.vibe) {
                const vibeTerms = this.getVibeTerms(preferences.vibe);
                const matchingTags = venue.tags.filter(tag =>
                    vibeTerms.some(term => tag.toLowerCase().includes(term))
                ).length;
                score += (matchingTags / venue.tags.length) * 0.1;
            }

            return {
                ...venue,
                recommendationScore: Math.min(score, 1.0) // Cap at 1.0
            };
        });
    }

    isGroupSizeCompatible(venue, groupSize) {
        const sizeCompatibility = {
            '1-2': ['Date Night', 'Intimate', 'Romantic', 'Quiet'],
            '3-4': ['Date Night', 'Group Hang', 'Casual', 'Social'],
            '5-8': ['Group Hang', 'Events', 'Group Seating', 'Large Space'],
            '9+': ['Events', 'Large Group', 'Private Events', 'Event Space']
        };

        const compatibleTags = sizeCompatibility[groupSize] || [];
        return venue.tags.some(tag => compatibleTags.some(compatible => 
            tag.toLowerCase().includes(compatible.toLowerCase())
        ));
    }

    // ============================================
    // SORTING METHODS
    // ============================================

    sortVenues(venues, sortBy = 'score') {
        const sortingMethods = {
            score: (a, b) => b.recommendationScore - a.recommendationScore,
            rating: (a, b) => b.rating - a.rating,
            price: (a, b) => {
                const priceOrder = { '$': 1, '$$': 2, '$$$': 3 };
                return priceOrder[a.price] - priceOrder[b.price];
            },
            name: (a, b) => a.name.localeCompare(b.name)
        };

        const sortMethod = sortingMethods[sortBy] || sortingMethods.score;
        return [...venues].sort(sortMethod);
    }

    // ============================================
    // PREFERENCE REFINEMENT
    // ============================================

    refineRecommendations(currentVenues, refinement, preferences) {
        const refinements = {
            cheaper: (venues) => {
                const priceOrder = { '$': 1, '$$': 2, '$$$': 3 };
                const currentPrice = preferences.price;
                if (!currentPrice) return venues;
                
                const currentLevel = priceOrder[currentPrice];
                const cheaperLevel = Math.max(1, currentLevel - 1);
                const cheaperPrice = Object.keys(priceOrder).find(key => priceOrder[key] === cheaperLevel);
                
                return venues.filter(venue => venue.price === cheaperPrice);
            },

            quieter: (venues) => {
                return venues.filter(venue => 
                    !venue.tags.some(tag => 
                        ['Club', 'Party', 'Loud', 'Dancing'].some(noisy => 
                            tag.toLowerCase().includes(noisy.toLowerCase())
                        )
                    )
                );
            },

            livelier: (venues) => {
                return venues.filter(venue => 
                    venue.tags.some(tag => 
                        ['Club', 'Dancing', 'Party', 'DJ', 'Live Music'].some(lively => 
                            tag.toLowerCase().includes(lively.toLowerCase())
                        )
                    )
                );
            },

            closer: (venues, location) => {
                if (!location) return venues;
                return venues.filter(venue => 
                    venue.neighborhood.toLowerCase().includes(location.toLowerCase())
                );
            },

            moreRomantic: (venues) => {
                return venues.filter(venue => 
                    venue.tags.some(tag => 
                        ['Date Night', 'Romantic', 'Intimate'].some(romantic => 
                            tag.toLowerCase().includes(romantic.toLowerCase())
                        )
                    )
                );
            },

            betterForGroups: (venues) => {
                return venues.filter(venue => 
                    venue.tags.some(tag => 
                        ['Group', 'Events', 'Large', 'Social'].some(group => 
                            tag.toLowerCase().includes(group.toLowerCase())
                        )
                    )
                );
            }
        };

        const refinementMethod = refinements[refinement];
        if (!refinementMethod) return currentVenues;

        let refined = refinementMethod(currentVenues, preferences.neighborhood);
        
        // If refinement returns no results, provide fallback
        if (refined.length === 0) {
            refined = this.getFallbackVenues(refinement, preferences);
        }

        return refined;
    }

    getFallbackVenues(refinement, preferences) {
        // Provide fallback venues when refinement is too restrictive
        const fallbackStrategies = {
            cheaper: () => this.venues.filter(venue => venue.price === '$'),
            quieter: () => this.venues.filter(venue => !venue.tags.includes('Nightclub')),
            livelier: () => this.venues.filter(venue => venue.tags.includes('Music') || venue.tags.includes('Dancing')),
            closer: () => this.venues, // Return all if location not found
            moreRomantic: () => this.venues.filter(venue => venue.vibe === 'Date night'),
            betterForGroups: () => this.venues.filter(venue => venue.tags.includes('Group'))
        };

        const strategy = fallbackStrategies[refinement];
        return strategy ? strategy().slice(0, 3) : this.venues.slice(0, 3);
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    getVibeTerms(vibe) {
        const vibeMappings = {
            'Chill': ['relaxed', 'casual', 'quiet', 'laid back', 'outdoor'],
            'Big night out': ['party', 'dance', 'club', 'energy', 'music'],
            'Date night': ['romantic', 'intimate', 'quiet', 'special'],
            'Group hang': ['social', 'group', 'friends', 'hang'],
            'Live music': ['music', 'band', 'live', 'acoustic', 'dj'],
            'Sports & TVs': ['sports', 'game', 'tv', 'watch', 'team']
        };

        return vibeMappings[vibe] || [vibe.toLowerCase()];
    }

    // ============================================
    // ALTERNATIVE RECOMMENDATION TYPES
    // ============================================

    getSimilarVenues(venueId, limit = 3) {
        const targetVenue = this.venues.find(v => v.id === venueId);
        if (!targetVenue) return [];

        return this.venues
            .filter(venue => venue.id !== venueId)
            .map(venue => {
                let similarity = 0;

                // Same neighborhood
                if (venue.neighborhood === targetVenue.neighborhood) similarity += 0.3;

                // Same price range
                if (venue.price === targetVenue.price) similarity += 0.3;

                // Same vibe
                if (venue.vibe === targetVenue.vibe) similarity += 0.2;

                // Overlapping tags
                const commonTags = venue.tags.filter(tag => targetVenue.tags.includes(tag));
                similarity += (commonTags.length / Math.max(venue.tags.length, targetVenue.tags.length)) * 0.2;

                return {
                    ...venue,
                    similarityScore: similarity
                };
            })
            .sort((a, b) => b.similarityScore - a.similarityScore)
            .slice(0, limit);
    }

    getTrendingVenues(limit = 5) {
        // For demo, return high-rated venues with good variety
        return [...this.venues]
            .filter(venue => venue.rating >= 4.2)
            .sort(() => 0.5 - Math.random()) // Shuffle for variety
            .slice(0, limit);
    }

    getQuickPicks(preferences = {}) {
        // Quick picks for common scenarios
        const quickPickScenarios = {
            dateNight: () => this.recommend({ vibe: 'Date night' }, { limit: 3 }),
            groupHang: () => this.recommend({ vibe: 'Group hang', groupSize: '5-8' }, { limit: 3 }),
            nightOut: () => this.recommend({ vibe: 'Big night out' }, { limit: 3 }),
            chill: () => this.recommend({ vibe: 'Chill' }, { limit: 3 }),
            sports: () => this.recommend({ vibe: 'Sports & TVs' }, { limit: 3 })
        };

        // Auto-detect scenario from preferences
        if (preferences.vibe === 'Date night') return quickPickScenarios.dateNight();
        if (preferences.vibe === 'Group hang') return quickPickScenarios.groupHang();
        if (preferences.vibe === 'Big night out') return quickPickScenarios.nightOut();
        if (preferences.vibe === 'Chill') return quickPickScenarios.chill();
        if (preferences.vibe === 'Sports & TVs') return quickPickScenarios.sports();

        // Default trending
        return this.getTrendingVenues(3);
    }
}

// Initialize recommender
document.addEventListener('DOMContentLoaded', () => {
    window.sceneLinkConciergeRecommender = new SceneLinkConciergeRecommender();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SceneLinkConciergeRecommender;
}