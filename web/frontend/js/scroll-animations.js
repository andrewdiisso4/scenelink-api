// Scroll Animations Handler
// Reveals elements as they enter viewport

class ScrollAnimations {
    constructor() {
        this.observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        this.init();
    }

    init() {
        this.setupIntersectionObserver();
        this.addAnimationClasses();
        this.setupSmoothScroll();
    }

    // ============================================
    // INTERSECTION OBSERVER
    // ============================================

    setupIntersectionObserver() {
        if (!('IntersectionObserver' in window)) {
            // Fallback for browsers without IntersectionObserver
            this.revealAllElements();
            return;
        }

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    // Optionally unobserve after revealing
                    // this.observer.unobserve(entry.target);
                }
            });
        }, this.observerOptions);

        // Observe all elements with scroll-reveal classes
        this.observeElements();
    }

    observeElements() {
        const elements = document.querySelectorAll(
            '.scroll-reveal, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-scale'
        );
        
        elements.forEach(el => {
            this.observer.observe(el);
        });
    }

    revealAllElements() {
        // Fallback: reveal all elements immediately
        const elements = document.querySelectorAll(
            '.scroll-reveal, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-scale'
        );
        
        elements.forEach(el => {
            el.classList.add('revealed');
        });
    }

    // ============================================
    // AUTO-ADD ANIMATION CLASSES
    // ============================================

    addAnimationClasses() {
        // Automatically add scroll-reveal to common elements
        const selectors = [
            '.venue-card',
            '.event-card',
            '.list-card',
            '.feature-card',
            '.section-content'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el, index) => {
                if (!el.classList.contains('scroll-reveal')) {
                    el.classList.add('scroll-reveal');
                    // Add stagger delay
                    el.style.transitionDelay = `${index * 0.1}s`;
                }
            });
        });

        // Re-observe new elements
        if (this.observer) {
            this.observeElements();
        }
    }

    // ============================================
    // SMOOTH SCROLL
    // ============================================

    setupSmoothScroll() {
        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (href === '#') return;

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    this.smoothScrollTo(target);
                }
            });
        });
    }

    smoothScrollTo(element, offset = 80) {
        const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - offset;
        
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }

    // ============================================
    // PARALLAX EFFECTS
    // ============================================

    initParallax() {
        const parallaxElements = document.querySelectorAll('[data-parallax]');
        
        if (parallaxElements.length === 0) return;

        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            
            parallaxElements.forEach(el => {
                const speed = el.dataset.parallax || 0.5;
                const yPos = -(scrolled * speed);
                el.style.transform = `translateY(${yPos}px)`;
            });
        });
    }

    // ============================================
    // STAGGER ANIMATIONS
    // ============================================

    staggerAnimation(container, delay = 100) {
        const elements = container.children;
        
        Array.from(elements).forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('animate-fade-in-up');
            }, index * delay);
        });
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    refresh() {
        // Refresh observer for dynamically added content
        if (this.observer) {
            this.observeElements();
        }
    }

    reset() {
        // Reset all revealed elements
        const elements = document.querySelectorAll('.revealed');
        elements.forEach(el => {
            el.classList.remove('revealed');
        });
        
        // Re-observe
        if (this.observer) {
            this.observeElements();
        }
    }
}

// Initialize Scroll Animations
let scrollAnimations;
document.addEventListener('DOMContentLoaded', () => {
    scrollAnimations = new ScrollAnimations();
    console.log('Scroll Animations initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.scrollAnimations = scrollAnimations;
}