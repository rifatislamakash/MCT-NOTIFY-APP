const fs = require('fs');
let lines = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8').split('\n');

const replacement = `        // Quick Access Badges for Today & Tomorrow events/notices/materials
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
                        const sortDate = window.getSafariSafeDate ? window.getSafariSafeDate(date + 'T' + time) : new Date(date + 'T' + time);
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
                        const sortDate = window.getSafariSafeDate ? window.getSafariSafeDate(date + 'T' + time) : new Date(date + 'T' + time);
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
            const targetScreen = (window.currentUserRole === 'admin' || (window.isAdminEmail && window.isAdminEmail(window.currentUserEmail)) || preferredRole === 'cr') ? 'screen-admin-dashboard' : 'screen-student-dashboard';
            
            if (currentScreen === targetScreen) {
                if (typeof window.showLoader === 'function') window.showLoader(true, 'Refreshing...');
                if (typeof window.loadDashboardTodayRoutine === 'function') window.loadDashboardTodayRoutine();
                if (typeof window.updateDashboardGreetings === 'function') window.updateDashboardGreetings();
                if (window.goHomeTimer) clearTimeout(window.goHomeTimer);
                window.goHomeTimer = setTimeout(() => {
                    if (typeof window.showLoader === 'function') window.showLoader(false);
                }, 500);
                return;
            }

            if (typeof window.navigate === 'function') window.navigate(targetScreen);
        }

        function updateBottomNavHighlights(screenId) {
            const isHome = screenId === 'screen-student-dashboard' || screenId === 'screen-admin-dashboard';
            const isProfile = screenId === 'screen-profile';
            const isGroups = ['screen-groups-list', 'screen-edit-group', 'screen-groups-detailed'].includes(screenId);
            const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || (window.isAdminEmail && window.isAdminEmail(window.currentUserEmail)));

            document.querySelectorAll('.nav-home-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (isHome) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });

            document.querySelectorAll('.nav-profile-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (isProfile) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });

            document.querySelectorAll('.nav-groups-btn').forEach(btn => {
                if (btn && btn.classList) {
                    if (!isAdmin) {
                        btn.classList.add('hidden');
                        return;
                    }
                    btn.classList.remove('hidden');
                    if (isGroups) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                    else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                }
            });
        }`;

// Replace lines 73 to 354
lines.splice(73, 355 - 73 + 1, replacement);
fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', lines.join('\n'));
console.log('Fixed dashboard.js duplicates!');
