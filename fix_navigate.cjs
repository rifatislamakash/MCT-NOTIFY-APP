const fs = require('fs');

let c = fs.readFileSync('index.html', 'utf8');
const startStr = 'window.navigate = function navigate(screenId) {';
const endStr = '// Push current screen to history before navigating away';

const startIdx = c.indexOf(startStr);
const endIdx = c.indexOf(endStr, startIdx);

const newLogic = `window.navigate = function navigate(screenId) {
            if (typeof window.__ROUTE_COUNT !== 'undefined') window.__ROUTE_COUNT++;
            if (window.currentActiveScreen === 'screen-student-dashboard' && screenId === 'screen-student-dashboard') {
                return;
            }
            if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[NAVIGATE]', \`Navigating to \${screenId}\`);
            
            if (typeof window.clearLastFocusedEditor === 'function') window.clearLastFocusedEditor();

            // Clear floating emoji picker menus to prevent ghosting
            document.querySelectorAll('.reaction-container.force-hovered, .reaction-container.hovered').forEach(el => {
                el.classList.remove('force-hovered', 'hovered');
            });

            const authScreensList = ['screen-splash', 'screen-welcome', 'screen-login', 'screen-register', 'screen-forgot', 'screen-recovery-otp', 'screen-confirm-email', 'screen-update-password', 'screen-onboarding', 'screen-notification-permission'];

            if (!authState.session || !authState.user) {
                if (!authScreensList.includes(screenId)) {
                    console.warn(\`[AUTH GUARD] Blocking access to \${screenId}: No active session token.\`);
                    screenId = 'screen-login';
                }
            }

            if (authScreensList.includes(screenId)) {
                document.body.classList.add('auth-mode');
                console.log(\`[NAVBAR VISIBILITY] Navbar hidden (auth-mode) for screen: \${screenId}\`);
            } else {
                document.body.classList.remove('auth-mode');
                console.log(\`[NAVBAR VISIBILITY] Navbar visible for screen: \${screenId}\`);
            }

            // Safety net: force-hide any stuck loader on every navigation
            if (typeof forceHideLoader === 'function') forceHideLoader();

            `;

c = c.substring(0, startIdx) + newLogic + c.substring(endIdx);
fs.writeFileSync('index.html', c);
console.log('Fixed auth guard');
