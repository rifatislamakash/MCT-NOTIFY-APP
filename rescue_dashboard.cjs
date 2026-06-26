const fs = require('fs');
const lines = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8').split('\n');

const deletedCode = `                // CRITICAL SECURITY CHECK: Verify this is a brand-new registration event, 
                // and ensure they haven't already received this specific welcome card.
                const isFirstTimeRegistration = sessionStorage.getItem('isFirstTimeRegistration') === 'true';
                if (isFirstTimeRegistration && !hasBeenNotified) {
                    console.log("[ONBOARDING] Brand new registration detected. Queueing one-time welcome push...");
                    
                    if (typeof window.triggerImmediateNotification === 'function') {
                        // 1.5-second safety delay ensures the fresh device token transaction 
                        // is fully committed to the database before the edge function tries to read it.
                        if (welcomeNotificationTimer) clearTimeout(welcomeNotificationTimer);
                        welcomeNotificationTimer = setTimeout(() => {
                            window.triggerImmediateNotification(
                                'welcome',
                                window.authState.user.id,
                                '🚀 Welcome to MCT Notify!',
                                'Your campus feed is live. What you get:\\n\\n• ⚡ Instant Alerts (No delays)\\n• 🗓️ Batch Feeds (No clutter)\\n• 🎯 Zero Spam (Only essentials)\\n\\nKeep notifications enabled to stay in the loop!'
                            );
                            
                            // Instantly lock the local storage key so a standard login or page refresh can never trigger it again
                            localStorage.setItem(welcomeStorageKey, 'true');
                            console.log("[ONBOARDING] Welcome notification successfully delivered and locked.");
                        }, 1500);
                    } else {
                        console.warn("[ONBOARDING] window.triggerImmediateNotification function is missing.");
                    }
                } else {
                    console.log("[ONBOARDING] Standard login or returning session detected. Skipping onboarding welcome push.");
                }
            }
        }



        // Quick Access Badges for Today & Tomorrow events/notices/materials
        function updateDashboardQuickAccessBadges() {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dayAfter = new Date(tomorrow);
                dayAfter.setDate(dayAfter.getDate() + 1);

                const toDateStr = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
                const todayStr = toDateStr(today);
                const tomorrowStr = toDateStr(tomorrow);

                // 1. Schedule Hub Quick Access Badge
                const scheduleBadge = document.getElementById('qa-schedule-badge');
                const now = new Date();
                if (scheduleBadge) {
                    const list = window.currentSchedulesList || [];
                    const count = list.filter(s => {
                        const date = s.schedule_date || s.date;
                        if (date !== todayStr && date !== tomorrowStr) return false;
                        const time = s.schedule_time || '23:59:00';
                        const sortDate = getSafariSafeDate(date + 'T' + time);
                        return sortDate >= now;
                    }).length;
                    if (count > 0) {
                        scheduleBadge.textContent = count > 9 ? '9+' : count;
                        scheduleBadge.classList.remove('hidden');
                    } else {
                        scheduleBadge.classList.add('hidden');
                    }
                }

                // 2. Notices Quick Access Badge
                const noticeBadge = document.getElementById('qa-notices-badge');
                if (noticeBadge) {
                    const list = window.currentNoticesList || [];
                    const count = list.filter(n => {
                        const date = n.notice_date;
                        if (date !== todayStr && date !== tomorrowStr) return false;
                        const time = n.notice_time || '23:59:00';
                        const sortDate = getSafariSafeDate(date + 'T' + time);
                        return sortDate >= now;
                    }).length;
                    if (count > 0) {
                        noticeBadge.textContent = count > 9 ? '9+' : count;
                        noticeBadge.classList.remove('hidden');
                    } else {
                        noticeBadge.classList.add('hidden');
                    }
                }


            } catch (err) {
                console.warn('[BADGE UPDATE ERROR]', err);
            }
        }

        // Home redirection / Syncing action
        function goHome() {
            const currentScreen = document.querySelector('.screen:not(.hidden)')?.id || document.querySelector('.screen.active')?.id;
            const preferredRole = window.currentUserRole === 'cr' ? (sessionStorage.getItem('crPreferredRole') || 'student') : null;
            const targetScreen = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail) || preferredRole === 'cr') ? 'screen-admin-dashboard' : 'screen-student-dashboard';
            
            if (currentScreen === targetScreen) {
                if (typeof showLoader === 'function') showLoader(true, 'Refreshing...');
                if (typeof window.loadDashboardTodayRoutine === 'function') window.loadDashboardTodayRoutine();
                if (typeof window.updateDashboardGreetings === 'function') window.updateDashboardGreetings();
                if (goHomeTimer) clearTimeout(goHomeTimer);
                goHomeTimer = setTimeout(() => {
                    if (typeof showLoader === 'function') showLoader(false);
                }, 500);
                return;
            }`;

const targetIndex = lines.findIndex(l => l.includes('const hasBeenNotified = localStorage.getItem(welcomeStorageKey);'));
if (targetIndex !== -1) {
    lines.splice(targetIndex + 1, 0, deletedCode);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', lines.join('\n'));
    console.log('Restored dashboard.js');
}
