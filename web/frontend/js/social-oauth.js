// Social Media OAuth Integration System

class SocialOAuth {
    constructor() {
        this.connectedAccounts = this.loadConnectedAccounts();
        this.init();
    }

    init() {
        this.createOAuthModal();
        this.attachEventListeners();
        this.updateConnectionStatus();
    }

    loadConnectedAccounts() {
        // Load from localStorage (in production, this would come from backend)
        const stored = localStorage.getItem('connectedSocialAccounts');
        return stored ? JSON.parse(stored) : {
            instagram: false,
            facebook: false,
            twitter: false,
            spotify: false
        };
    }

    saveConnectedAccounts() {
        localStorage.setItem('connectedSocialAccounts', JSON.stringify(this.connectedAccounts));
    }

    createOAuthModal() {
        const modalHTML = `
            <div class="oauth-modal-overlay" id="oauthModal">
                <div class="oauth-modal">
                    <div class="oauth-modal-header">
                        <h2>Connect Social Account</h2>
                        <button class="btn-close-modal" onclick="socialOAuth.closeModal()">×</button>
                    </div>
                    
                    <div class="oauth-modal-body">
                        <div class="oauth-platform-info">
                            <div class="oauth-platform-icon" id="oauthPlatformIcon"></div>
                            <h3 id="oauthPlatformName"></h3>
                            <p id="oauthPlatformDescription"></p>
                        </div>

                        <div class="oauth-benefits">
                            <h4>Benefits of connecting:</h4>
                            <ul id="oauthBenefitsList"></ul>
                        </div>

                        <div class="oauth-permissions">
                            <h4>We'll be able to:</h4>
                            <ul id="oauthPermissionsList"></ul>
                        </div>

                        <div class="oauth-privacy-note">
                            <p>🔒 Your privacy is important to us. We'll never post without your permission.</p>
                        </div>
                    </div>

                    <div class="oauth-modal-footer">
                        <button class="btn-oauth btn-oauth-secondary" onclick="socialOAuth.closeModal()">Cancel</button>
                        <button class="btn-oauth btn-oauth-primary" id="connectOAuthBtn">Connect Account</button>
                    </div>
                </div>
            </div>
        `;

        // Add CSS for OAuth modal
        const styleHTML = `
            <style>
                .oauth-modal-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    z-index: 9999;
                    animation: fadeIn 0.3s ease;
                }

                .oauth-modal-overlay.active {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }

                .oauth-modal {
                    background: white;
                    border-radius: 16px;
                    max-width: 500px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.3s ease;
                }

                .oauth-modal-header {
                    padding: 25px 30px;
                    border-bottom: 1px solid #e2e8f0;
                    position: relative;
                }

                .oauth-modal-header h2 {
                    font-size: 1.5rem;
                    color: #2d3748;
                    margin: 0;
                }

                .oauth-modal-body {
                    padding: 30px;
                }

                .oauth-platform-info {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .oauth-platform-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 15px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.5rem;
                }

                .oauth-platform-info h3 {
                    font-size: 1.5rem;
                    color: #2d3748;
                    margin-bottom: 8px;
                }

                .oauth-platform-info p {
                    color: #718096;
                    font-size: 0.95rem;
                }

                .oauth-benefits,
                .oauth-permissions {
                    margin-bottom: 25px;
                }

                .oauth-benefits h4,
                .oauth-permissions h4 {
                    font-size: 1.1rem;
                    color: #2d3748;
                    margin-bottom: 12px;
                }

                .oauth-benefits ul,
                .oauth-permissions ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .oauth-benefits li,
                .oauth-permissions li {
                    padding: 10px 0;
                    color: #4a5568;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .oauth-benefits li:before {
                    content: '✓';
                    color: #48bb78;
                    font-weight: bold;
                    font-size: 1.2rem;
                }

                .oauth-permissions li:before {
                    content: '•';
                    color: #667eea;
                    font-weight: bold;
                    font-size: 1.5rem;
                }

                .oauth-privacy-note {
                    background: #f7fafc;
                    border-radius: 10px;
                    padding: 15px;
                    text-align: center;
                }

                .oauth-privacy-note p {
                    margin: 0;
                    color: #4a5568;
                    font-size: 0.9rem;
                }

                .oauth-modal-footer {
                    padding: 20px 30px;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    gap: 15px;
                }

                .btn-oauth {
                    flex: 1;
                    padding: 14px 24px;
                    border: none;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .btn-oauth-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .btn-oauth-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .btn-oauth-secondary {
                    background: #f7fafc;
                    color: #4a5568;
                    border: 2px solid #e2e8f0;
                }

                .btn-oauth-secondary:hover {
                    background: #edf2f7;
                }

                @media (max-width: 768px) {
                    .oauth-modal {
                        max-width: 100%;
                        border-radius: 0;
                    }
                }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', styleHTML + modalHTML);
    }

    attachEventListeners() {
        // Close modal on overlay click
        const overlay = document.getElementById('oauthModal');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal();
                }
            });
        }
    }

    getPlatformConfig(platform) {
        const configs = {
            instagram: {
                name: 'Instagram',
                icon: '📷',
                color: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                description: 'Share your dining experiences with your Instagram followers',
                benefits: [
                    'Share check-ins to your Instagram story',
                    'Post photos of your meals',
                    'Tag restaurants in your posts',
                    'See what your friends are eating'
                ],
                permissions: [
                    'View your basic profile information',
                    'Post stories on your behalf (with permission)',
                    'Access your followers list'
                ]
            },
            facebook: {
                name: 'Facebook',
                icon: '👥',
                color: '#1877f2',
                description: 'Connect with friends and share your favorite spots',
                benefits: [
                    'Share reservations with friends',
                    'See where your friends are dining',
                    'Get recommendations from your network',
                    'RSVP to events'
                ],
                permissions: [
                    'View your basic profile information',
                    'Access your friends list',
                    'Post on your behalf (with permission)'
                ]
            },
            twitter: {
                name: 'Twitter',
                icon: '🐦',
                color: '#1da1f2',
                description: 'Tweet about your dining experiences',
                benefits: [
                    'Tweet your check-ins',
                    'Share restaurant reviews',
                    'Follow restaurant accounts',
                    'Get real-time updates'
                ],
                permissions: [
                    'View your basic profile information',
                    'Post tweets on your behalf (with permission)',
                    'Access your followers'
                ]
            },
            spotify: {
                name: 'Spotify',
                icon: '🎵',
                color: '#1db954',
                description: 'Discover restaurant playlists and music',
                benefits: [
                    'See restaurant playlists',
                    'Save venue music to your library',
                    'Share your music taste',
                    'Get music-based recommendations'
                ],
                permissions: [
                    'View your basic profile information',
                    'Access your playlists',
                    'View your listening history'
                ]
            }
        };

        return configs[platform];
    }

    openModal(platform) {
        const config = this.getPlatformConfig(platform);
        const modal = document.getElementById('oauthModal');

        // Set platform info
        const icon = document.getElementById('oauthPlatformIcon');
        icon.textContent = config.icon;
        icon.style.background = config.color;

        document.getElementById('oauthPlatformName').textContent = config.name;
        document.getElementById('oauthPlatformDescription').textContent = config.description;

        // Set benefits
        const benefitsList = document.getElementById('oauthBenefitsList');
        benefitsList.innerHTML = config.benefits.map(benefit => `<li>${benefit}</li>`).join('');

        // Set permissions
        const permissionsList = document.getElementById('oauthPermissionsList');
        permissionsList.innerHTML = config.permissions.map(permission => `<li>${permission}</li>`).join('');

        // Set connect button action
        const connectBtn = document.getElementById('connectOAuthBtn');
        connectBtn.onclick = () => this.connectAccount(platform);

        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        const modal = document.getElementById('oauthModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    async connectAccount(platform) {
        const connectBtn = document.getElementById('connectOAuthBtn');
        const originalText = connectBtn.textContent;
        
        connectBtn.textContent = 'Connecting...';
        connectBtn.disabled = true;

        // Simulate OAuth flow (in production, this would redirect to OAuth provider)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // In a real application, you would:
        // 1. Redirect to OAuth provider
        // 2. Handle callback
        // 3. Store access token securely on backend
        // 4. Update UI

        // For demo, just mark as connected
        this.connectedAccounts[platform] = true;
        this.saveConnectedAccounts();
        this.updateConnectionStatus();

        // Show success
        this.showSuccessMessage(platform);

        connectBtn.textContent = originalText;
        connectBtn.disabled = false;
    }

    disconnectAccount(platform) {
        if (confirm(`Are you sure you want to disconnect your ${platform} account?`)) {
            this.connectedAccounts[platform] = false;
            this.saveConnectedAccounts();
            this.updateConnectionStatus();
            
            // Show notification
            this.showNotification(`${platform} account disconnected`, 'success');
        }
    }

    updateConnectionStatus() {
        // Update all connection buttons on the page
        document.querySelectorAll('[data-social-platform]').forEach(element => {
            const platform = element.dataset.socialPlatform;
            const isConnected = this.connectedAccounts[platform];

            if (element.classList.contains('social-item')) {
                // Profile page style
                const button = element.querySelector('.btn-connect, .btn-disconnect');
                const status = element.querySelector('.connection-status');
                
                if (isConnected) {
                    element.classList.add('connected');
                    if (button) {
                        button.textContent = 'Disconnect';
                        button.className = 'btn-disconnect';
                        button.onclick = () => this.disconnectAccount(platform);
                    }
                    if (status) {
                        status.textContent = 'Connected';
                        status.style.color = '#48bb78';
                    }
                } else {
                    element.classList.remove('connected');
                    if (button) {
                        button.textContent = 'Connect';
                        button.className = 'btn-connect';
                        button.onclick = () => this.openModal(platform);
                    }
                    if (status) {
                        status.textContent = '';
                    }
                }
            }
        });
    }

    showSuccessMessage(platform) {
        const config = this.getPlatformConfig(platform);
        const modalBody = document.querySelector('.oauth-modal-body');
        
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="width: 80px; height: 80px; background: #48bb78; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 2.5rem; color: white;">
                    ✓
                </div>
                <h3 style="font-size: 1.8rem; color: #2d3748; margin-bottom: 10px;">Successfully Connected!</h3>
                <p style="color: #718096; font-size: 1.1rem; margin-bottom: 20px;">
                    Your ${config.name} account is now connected to SceneLink
                </p>
                <p style="color: #4a5568; font-size: 0.95rem;">
                    You can now enjoy all the benefits of ${config.name} integration
                </p>
            </div>
        `;

        const footer = document.querySelector('.oauth-modal-footer');
        footer.innerHTML = `
            <button class="btn-oauth btn-oauth-primary" onclick="socialOAuth.closeModal()" style="width: 100%;">
                Done
            </button>
        `;

        setTimeout(() => {
            this.closeModal();
        }, 2000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#48bb78' : '#667eea'};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize social OAuth system
let socialOAuth;
document.addEventListener('DOMContentLoaded', () => {
    socialOAuth = new SocialOAuth();
});

// Helper function to open OAuth modal from anywhere
function openSocialOAuth(platform) {
    if (socialOAuth) {
        socialOAuth.openModal(platform);
    }
}

// Helper function to disconnect account
function disconnectSocialAccount(platform) {
    if (socialOAuth) {
        socialOAuth.disconnectAccount(platform);
    }
}