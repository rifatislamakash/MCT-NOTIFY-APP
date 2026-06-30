const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const targetFunctionStart = '        window.navigate = function navigate(screenId) {';
const s = html.indexOf(targetFunctionStart);
if (s === -1) throw new Error("Could not find navigate function");

let e = html.indexOf('        }', s);
while(html.substring(s, e).split('{').length !== html.substring(s, e).split('}').length) {
    e = html.indexOf('        }', e + 1);
}

const originalBody = html.substring(s, e + 9);

const newNavigate = `        window.navigate = function navigate(screenId) {
            try {
                if (typeof window.__ROUTE_COUNT !== 'undefined') window.__ROUTE_COUNT++;
                if (window.currentActiveScreen === 'screen-student-dashboard' && screenId === 'screen-student-dashboard') {
                    return;
                }
                
                if (typeof window.clearLastFocusedEditor === 'function') window.clearLastFocusedEditor();

                document.querySelectorAll('.reaction-container.force-hovered, .reaction-container.hovered').forEach(el => {
                    el.classList.remove('force-hovered', 'hovered');
                });

                const authState = window.authState || { session: null, user: null };
                const authScreensList = ['screen-splash', 'screen-welcome', 'screen-login', 'screen-register', 'screen-forgot', 'screen-recovery-otp', 'screen-confirm-email', 'screen-update-password', 'screen-onboarding', 'screen-notification-permission'];

                if (!authState.session || !authState.user) {
                    if (!authScreensList.includes(screenId)) {
                        screenId = 'screen-login';
                    }
                }

                if (authScreensList.includes(screenId)) {
                    document.body.classList.add('auth-mode');
                } else {
                    document.body.classList.remove('auth-mode');
                }

                if (typeof forceHideLoader === 'function') forceHideLoader();

                if (window.currentActiveScreen && window.currentActiveScreen !== screenId) {
                    if (typeof cancelRequestsForScreen === 'function') cancelRequestsForScreen(window.currentActiveScreen);
                    if (typeof _navigationHistory !== 'undefined') {
                        _navigationHistory.push(window.currentActiveScreen);
                        if (_navigationHistory.length > 20) _navigationHistory.shift();
                    }
                }

                if (!window.history.state || window.history.state.screenId !== screenId) {
                    window.history.pushState({ screenId }, "", "#" + screenId);
                }

                document.querySelectorAll('.screen').forEach(s => {
                    s.classList.remove('active');
                });
                
                const target = document.getElementById(screenId);
                if (target) {
                    target.classList.add('active');
                    window.currentActiveScreen = screenId;

                    if (screenId === 'screen-welcome') {
                        if (typeof startTypewriter === 'function') startTypewriter();
                    }

                    if (typeof updateBottomNavHighlights === 'function') updateBottomNavHighlights(screenId);
                    
                    const isScheduleNav = ['screen-schedule-list', 'screen-create-schedule', 'screen-schedule-details', 'screen-edit-schedule'].includes(screenId);
                    document.querySelectorAll('.nav-schedule-btn').forEach(btn => {
                        if (btn && btn.classList) {
                            if (isScheduleNav) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                            else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                        }
                    });

                    const isNotices = ['screen-notices-list'].includes(screenId);
                    document.querySelectorAll('.nav-notices-btn').forEach(btn => {
                        if (btn && btn.classList) {
                            if (isNotices) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                            else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                        }
                    });

                    const isProfile = ['screen-profile'].includes(screenId);
                    document.querySelectorAll('.nav-profile-btn').forEach(btn => {
                        if (btn && btn.classList) {
                            if (isProfile) { btn.classList.add('text-indigo-400'); btn.classList.remove('text-slate-400'); }
                            else { btn.classList.remove('text-indigo-400'); btn.classList.add('text-slate-400'); }
                        }
                    });

                    // Scroll to top
                    const scrollArea = target.querySelector('.overflow-y-auto');
                    if (scrollArea) {
                        scrollArea.scrollTop = 0;
                    }
                } else {
                    console.error("CRITICAL ERROR: Navigate target not found for screenId:", screenId);
                    const dashboard = document.getElementById('screen-student-dashboard');
                    if (dashboard) {
                        dashboard.classList.add('active');
                        window.currentActiveScreen = 'screen-student-dashboard';
                    }
                }
            } catch (err) {
                console.error("CRITICAL ERROR in navigate function:", err);
                const dashboard = document.getElementById('screen-student-dashboard');
                if (dashboard) {
                    dashboard.classList.add('active');
                    window.currentActiveScreen = 'screen-student-dashboard';
                }
            }
        }`;

html = html.replace(originalBody, newNavigate);
fs.writeFileSync('index.html', html);
console.log("Done upgrading navigate!");
