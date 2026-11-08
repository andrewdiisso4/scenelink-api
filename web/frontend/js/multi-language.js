// Multi-Language Support System
// Implements localization and internationalization for SceneLink

class MultiLanguageSystem {
    constructor() {
        this.currentLanguage = this.loadLanguage();
        this.translations = {};
        this.supportedLanguages = [
            { code: 'en', name: 'English', flag: '🇺🇸', rtl: false },
            { code: 'es', name: 'Español', flag: '🇪🇸', rtl: false },
            { code: 'fr', name: 'Français', flag: '🇫🇷', rtl: false },
            { code: 'zh', name: '中文', flag: '🇨🇳', rtl: false },
            { code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪', rtl: false },
            { code: 'ja', name: '日本語', flag: '🇯🇵', rtl: false },
            { code: 'pt', name: 'Português', flag: '🇧🇷', rtl: false }
        ];
        this.init();
    }

    init() {
        this.loadTranslations();
        this.createLanguageSelector();
        this.applyLanguage(this.currentLanguage);
        this.setupEventListeners();
    }

    // ============================================
    // TRANSLATION LOADING
    // ============================================

    loadTranslations() {
        // English (default)
        this.translations.en = {
            // Navigation
            'nav.home': 'Home',
            'nav.explore': 'Explore',
            'nav.social': 'Social',
            'nav.events': 'Events',
            'nav.nightlife': 'Nightlife',
            'nav.tonight': "Tonight's Picks",
            'nav.lists': 'My Lists',
            'nav.profile': 'Profile',
            'nav.signup': 'Sign Up',
            'nav.login': 'Log In',

            // Search
            'search.placeholder': 'Search restaurants, bars, events...',
            'search.advanced': 'Advanced Filters',
            'search.location': 'Location',
            'search.cuisine': 'Cuisine',
            'search.price': 'Price Range',
            'search.rating': 'Rating',

            // Common Actions
            'action.save': 'Save',
            'action.share': 'Share',
            'action.like': 'Like',
            'action.comment': 'Comment',
            'action.book': 'Book Now',
            'action.reserve': 'Reserve Table',
            'action.view': 'View Details',
            'action.cancel': 'Cancel',
            'action.confirm': 'Confirm',

            // Venue Details
            'venue.rating': 'Rating',
            'venue.reviews': 'Reviews',
            'venue.price': 'Price',
            'venue.cuisine': 'Cuisine',
            'venue.hours': 'Hours',
            'venue.phone': 'Phone',
            'venue.website': 'Website',
            'venue.address': 'Address',

            // Social
            'social.feed': 'Social Feed',
            'social.friends': 'Friends',
            'social.following': 'Following',
            'social.followers': 'Followers',
            'social.posts': 'Posts',
            'social.activity': 'Activity',

            // Group Planning
            'group.create': 'Create Event',
            'group.invite': 'Invite Friends',
            'group.vote': 'Vote',
            'group.chat': 'Chat',
            'group.participants': 'Participants',

            // Messages
            'msg.success': 'Success!',
            'msg.error': 'Error',
            'msg.loading': 'Loading...',
            'msg.saved': 'Saved successfully',
            'msg.shared': 'Shared to feed'
        };

        // Spanish
        this.translations.es = {
            'nav.home': 'Inicio',
            'nav.explore': 'Explorar',
            'nav.social': 'Social',
            'nav.events': 'Eventos',
            'nav.nightlife': 'Vida Nocturna',
            'nav.tonight': 'Selecciones de Esta Noche',
            'nav.lists': 'Mis Listas',
            'nav.profile': 'Perfil',
            'nav.signup': 'Registrarse',
            'nav.login': 'Iniciar Sesión',

            'search.placeholder': 'Buscar restaurantes, bares, eventos...',
            'search.advanced': 'Filtros Avanzados',
            'search.location': 'Ubicación',
            'search.cuisine': 'Cocina',
            'search.price': 'Rango de Precio',
            'search.rating': 'Calificación',

            'action.save': 'Guardar',
            'action.share': 'Compartir',
            'action.like': 'Me Gusta',
            'action.comment': 'Comentar',
            'action.book': 'Reservar Ahora',
            'action.reserve': 'Reservar Mesa',
            'action.view': 'Ver Detalles',
            'action.cancel': 'Cancelar',
            'action.confirm': 'Confirmar',

            'venue.rating': 'Calificación',
            'venue.reviews': 'Reseñas',
            'venue.price': 'Precio',
            'venue.cuisine': 'Cocina',
            'venue.hours': 'Horario',
            'venue.phone': 'Teléfono',
            'venue.website': 'Sitio Web',
            'venue.address': 'Dirección',

            'msg.success': '¡Éxito!',
            'msg.error': 'Error',
            'msg.loading': 'Cargando...',
            'msg.saved': 'Guardado exitosamente',
            'msg.shared': 'Compartido en el feed'
        };

        // French
        this.translations.fr = {
            'nav.home': 'Accueil',
            'nav.explore': 'Explorer',
            'nav.social': 'Social',
            'nav.events': 'Événements',
            'nav.nightlife': 'Vie Nocturne',
            'nav.tonight': 'Sélections de Ce Soir',
            'nav.lists': 'Mes Listes',
            'nav.profile': 'Profil',
            'nav.signup': "S'inscrire",
            'nav.login': 'Se Connecter',

            'search.placeholder': 'Rechercher restaurants, bars, événements...',
            'search.advanced': 'Filtres Avancés',
            'search.location': 'Emplacement',
            'search.cuisine': 'Cuisine',
            'search.price': 'Gamme de Prix',
            'search.rating': 'Note',

            'action.save': 'Enregistrer',
            'action.share': 'Partager',
            'action.like': 'Aimer',
            'action.comment': 'Commenter',
            'action.book': 'Réserver Maintenant',
            'action.reserve': 'Réserver une Table',
            'action.view': 'Voir les Détails',
            'action.cancel': 'Annuler',
            'action.confirm': 'Confirmer',

            'msg.success': 'Succès!',
            'msg.error': 'Erreur',
            'msg.loading': 'Chargement...',
            'msg.saved': 'Enregistré avec succès',
            'msg.shared': 'Partagé sur le fil'
        };

        // Chinese (Simplified)
        this.translations.zh = {
            'nav.home': '首页',
            'nav.explore': '探索',
            'nav.social': '社交',
            'nav.events': '活动',
            'nav.nightlife': '夜生活',
            'nav.tonight': '今晚精选',
            'nav.lists': '我的列表',
            'nav.profile': '个人资料',
            'nav.signup': '注册',
            'nav.login': '登录',

            'search.placeholder': '搜索餐厅、酒吧、活动...',
            'search.advanced': '高级筛选',
            'search.location': '位置',
            'search.cuisine': '菜系',
            'search.price': '价格范围',
            'search.rating': '评分',

            'action.save': '保存',
            'action.share': '分享',
            'action.like': '喜欢',
            'action.comment': '评论',
            'action.book': '立即预订',
            'action.reserve': '预订餐桌',
            'action.view': '查看详情',
            'action.cancel': '取消',
            'action.confirm': '确认',

            'msg.success': '成功！',
            'msg.error': '错误',
            'msg.loading': '加载中...',
            'msg.saved': '保存成功',
            'msg.shared': '已分享到动态'
        };
    }

    // ============================================
    // LANGUAGE SELECTOR UI
    // ============================================

    createLanguageSelector() {
        // Check if selector already exists
        if (document.getElementById('languageSelector')) return;

        // Create language selector button in header
        const navRight = document.querySelector('.nav-right');
        if (!navRight) return;

        const languageBtn = document.createElement('button');
        languageBtn.className = 'language-selector-btn';
        languageBtn.id = 'languageSelectorBtn';
        languageBtn.innerHTML = `
            <i class="fas fa-globe"></i>
            <span class="current-lang">${this.getCurrentLanguageFlag()}</span>
        `;

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'language-dropdown';
        dropdown.id = 'languageDropdown';
        dropdown.innerHTML = this.generateLanguageOptions();

        languageBtn.appendChild(dropdown);
        
        // Insert before sign up button
        const signupBtn = navRight.querySelector('.btn-header-primary');
        if (signupBtn) {
            navRight.insertBefore(languageBtn, signupBtn);
        } else {
            navRight.appendChild(languageBtn);
        }
    }

    generateLanguageOptions() {
        return `
            <div class="language-options">
                ${this.supportedLanguages.map(lang => `
                    <button class="language-option ${lang.code === this.currentLanguage ? 'active' : ''}" 
                            data-lang="${lang.code}"
                            onclick="multiLang.changeLanguage('${lang.code}')">
                        <span class="lang-flag">${lang.flag}</span>
                        <span class="lang-name">${lang.name}</span>
                        ${lang.code === this.currentLanguage ? '<i class="fas fa-check"></i>' : ''}
                    </button>
                `).join('')}
            </div>
        `;
    }

    getCurrentLanguageFlag() {
        const lang = this.supportedLanguages.find(l => l.code === this.currentLanguage);
        return lang ? lang.flag : '🇺🇸';
    }

    // ============================================
    // LANGUAGE APPLICATION
    // ============================================

    applyLanguage(langCode) {
        this.currentLanguage = langCode;
        this.saveLanguage(langCode);

        // Apply RTL if needed
        const lang = this.supportedLanguages.find(l => l.code === langCode);
        if (lang && lang.rtl) {
            document.documentElement.setAttribute('dir', 'rtl');
            document.body.classList.add('rtl');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.body.classList.remove('rtl');
        }

        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', langCode);

        // Translate all elements with data-i18n attribute
        this.translatePage();

        // Update language selector
        this.updateLanguageSelector();
    }

    translatePage() {
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.translate(key);
            
            if (translation) {
                // Check if it's a placeholder
                if (element.hasAttribute('placeholder')) {
                    element.setAttribute('placeholder', translation);
                } else if (element.hasAttribute('title')) {
                    element.setAttribute('title', translation);
                } else {
                    element.textContent = translation;
                }
            }
        });
    }

    translate(key) {
        const translations = this.translations[this.currentLanguage];
        return translations && translations[key] ? translations[key] : key;
    }

    changeLanguage(langCode) {
        if (langCode === this.currentLanguage) return;
        
        this.applyLanguage(langCode);
        
        // Show notification
        if (typeof showNotification === 'function') {
            const langName = this.supportedLanguages.find(l => l.code === langCode)?.name;
            showNotification('success', 'Language Changed', `Language changed to ${langName}`);
        }

        // Close dropdown
        this.closeLanguageDropdown();
    }

    updateLanguageSelector() {
        const currentLangSpan = document.querySelector('.current-lang');
        if (currentLangSpan) {
            currentLangSpan.textContent = this.getCurrentLanguageFlag();
        }

        // Update dropdown options
        const dropdown = document.getElementById('languageDropdown');
        if (dropdown) {
            dropdown.innerHTML = this.generateLanguageOptions();
        }
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Toggle language dropdown
        const languageBtn = document.getElementById('languageSelectorBtn');
        if (languageBtn) {
            languageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLanguageDropdown();
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('languageDropdown');
            if (dropdown && !e.target.closest('.language-selector-btn')) {
                this.closeLanguageDropdown();
            }
        });
    }

    toggleLanguageDropdown() {
        const dropdown = document.getElementById('languageDropdown');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    }

    closeLanguageDropdown() {
        const dropdown = document.getElementById('languageDropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    loadLanguage() {
        const stored = localStorage.getItem('preferredLanguage');
        if (stored) return stored;

        // Detect browser language
        const browserLang = navigator.language.split('-')[0];
        // Phase 5K: this.supportedLanguages may not yet be assigned when loadLanguage()
        // is called from the constructor — guard against that.
        const list = (this.supportedLanguages && this.supportedLanguages.length)
            ? this.supportedLanguages
            : [{ code: 'en' }, { code: 'es' }, { code: 'pt' }, { code: 'fr' },
               { code: 'zh' }, { code: 'ja' }, { code: 'de' }, { code: 'it' }];
        const supported = list.find(l => l.code === browserLang);

        return supported ? browserLang : 'en';
    }

    saveLanguage(langCode) {
        localStorage.setItem('preferredLanguage', langCode);
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    formatNumber(number, langCode = this.currentLanguage) {
        return new Intl.NumberFormat(langCode).format(number);
    }

    formatCurrency(amount, currency = 'USD', langCode = this.currentLanguage) {
        return new Intl.NumberFormat(langCode, {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    formatDate(date, langCode = this.currentLanguage) {
        return new Intl.DateTimeFormat(langCode, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(new Date(date));
    }

    formatTime(date, langCode = this.currentLanguage) {
        return new Intl.DateTimeFormat(langCode, {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    }
}

// Initialize Multi-Language System
let multiLang;
document.addEventListener('DOMContentLoaded', () => {
    multiLang = new MultiLanguageSystem();
    console.log('Multi-Language System initialized');
});

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.multiLang = multiLang;
}