import { _supabase } from './supabase-client.js?v=rescue2';
import { crPermissionService } from './services/crPermissionService.js?v=rescue2';
import { showGlobalToast, showLoader, deduplicateRequest } from './utils.js?v=rescue2';
import { CourseStore } from './stores/CourseStore.js?v=rescue2';
import { FacultyStore } from './stores/FacultyStore.js?v=rescue2';
import { RoutineStore } from './stores/RoutineStore.js?v=rescue2';
import { NotificationStore } from './stores/NotificationStore.js?v=rescue2';
import { ProfileStore } from './stores/ProfileStore.js?v=rescue2';

let _isRouting = false;
let isRegistering = false;

        export async function fetchUserProfile(userId) {
            try {
                const profilePromise = _supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();
                
                let data, error;
                try {
                    if (window._supabaseSdkFailing) throw new Error('sdk_timeout');
                    let timerId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('sdk_timeout')), 400);
                    });
                    try {
                        const result = await Promise.race([profilePromise, timeoutPromise]);
                        data = result.data;
                        error = result.error;
                    } finally {
                        clearTimeout(timerId);
                    }
                } catch (e) {
                    if (e.message === 'sdk_timeout') {
                        window._supabaseSdkFailing = true;
                        const url = `${_supabase.supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`;
                        const res = await fetch(url, {
                            headers: {
                                'apikey': _supabase.supabaseKey,
                                'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                'cache-control': 'no-cache'
                            },
                            cache: 'no-store'
                        });
                        const fetchResult = await res.json();
                        data = fetchResult && fetchResult.length > 0 ? fetchResult[0] : null;
                    } else {
                        throw e;
                    }
                }
                if (error) throw error;
                return data;
            } catch (err) {
                console.error('Exception caught in fetchUserProfile:', err);
                return null;
            }
        }



        window.waitForAuthReady = async function(timeoutMs = 10000) {
            const isReady = () => window.authState && window.authState.profile && window.authState.profile.batch_id;
            if (isReady()) return true;

            // Optional iOS fallback check: manually check session if not ready
            if (window._supabase && window._supabase.auth) {
                const { data } = await window._supabase.auth.getSession();
                if (data && data.session && !window.authState.session) {
                    window.authState.session = data.session;
                    window.authState.user = data.session.user;
                }
            }
            if (isReady()) return true;

            return new Promise((resolve) => {
                const start = Date.now();
                const interval = setInterval(() => {
                    if (isReady()) {
                        clearInterval(interval);
                        resolve(true);
                    } else if (Date.now() - start > timeoutMs) {
                        clearInterval(interval);
                        resolve(false);
                    }
                }, 100);
            });
        };

        export const handleUserRouting = async (user, profile) => {
            console.log("[ROUTING INIT] Starting user routing...");
            
            if (typeof window.navigate === 'function') {
                console.log("[ROUTING FUNCTION FOUND] window.navigate is available.");
                console.log("[WINDOW NAVIGATE BOUND] Confirmed bounding of navigate function.");
                console.log("[ROUTING READY] Proceeding with routing execution.");
            } else {
                console.warn("[ROUTING FUNCTION MISSING] window.navigate is undefined. Routing will likely fail.");
            }

            if (_isRouting) return;
            _isRouting = true;
            try {

            if (!user) {
                window.currentUserRole = 'student'; // Fallback
                window.navigate('screen-welcome');
                return;
            }

            // PART 1: Email confirmation check
            if (!user.email_confirmed_at) {
                console.log('[AUTH] Email not confirmed, redirecting to confirmation screen.');
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                window.navigate('screen-confirm-email');
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            window.currentUserEmail = String(profile?.email || user.email || '').trim().toLowerCase();
            window.currentUserRole = String(profile?.role || '').trim().toLowerCase(); // Set global role

            // Fetch and set user courses unconditionally on login to populate state
            try {
                const isAdminCheck = window.currentUserRole === 'admin' || window.isAdminEmail(user.email);
                if (isAdminCheck) {
                    window.currentUserCoursesList = [];
                } else {
                    const coursesPromise = deduplicateRequest('user_courses_boot', async () => {
                        const sdkPromise = _supabase.from('user_courses').select('*').eq('user_id', user.id);
                        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sdk_timeout')), 2000));
                        try {
                            const { data, error } = await Promise.race([sdkPromise, timeout]);
                            if (error) throw error;
                            return data;
                        } catch (e) {
                            if (e.message === 'sdk_timeout') {
                                const url = `${_supabase.supabaseUrl}/rest/v1/user_courses?user_id=eq.${user.id}&select=*`;
                                const res = await fetch(url, {
                                    headers: {
                                        'apikey': _supabase.supabaseKey,
                                        'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                        'cache-control': 'no-cache'
                                    },
                                    cache: 'no-store'
                                });
                                const fetchResult = await res.json();
                                if (fetchResult.error) throw new Error(fetchResult.error.message);
                                return fetchResult;
                            }
                            throw e;
                        }
                    });
                    const userCourses = await coursesPromise;
                    window.currentUserCoursesList = userCourses || [];
                    window._userCoursesFetchFailed = false;
                }
            } catch (e) { 
                console.warn("[ROUTING] user_courses fetch failed or timed out:", e);
                window._userCoursesFetchFailed = true;
            }

            const loadDashboardDataAsync = async () => {
                try {
                    const currentPrefRole = sessionStorage.getItem('crPreferredRole') || window.authState?.profile?.role || 'student';
                    const isActualAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);
                    const isCR = window.currentUserRole === 'cr';

                    const tasks = [];
                    if (typeof window.loadContentSettings === 'function') tasks.push(window.loadContentSettings().catch(console.warn));
                    
                    // Lazy load heavy queries for Admins (Admin will fetch when clicking the tab)
                    if (!isActualAdmin) {
                        if (typeof window.loadNotices === 'function') tasks.push(window.loadNotices(true).catch(console.warn));
                        
                        if (typeof window.loadScheduleList === 'function') tasks.push(window.loadScheduleList(true).catch(console.warn));
                    }

                    if (window.PollService && typeof window.PollService.loadPolls === 'function') {
                        tasks.push(window.PollService.loadPolls().then(() => {
                            if (window.currentUserRole === 'student' && typeof window.PollService?.checkAndShowPopup === 'function') {
                                window.PollService.checkAndShowPopup();
                            }
                        }).catch(console.warn));
                    }

                    if (isActualAdmin || (isCR && currentPrefRole === 'cr')) {
                        if (typeof window.loadAdminReports === 'function') tasks.push(window.loadAdminReports().catch(console.warn));
                    }
                    
                    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 30000));
                    await Promise.race([Promise.all(tasks), timeoutPromise]);
                    
                    // Unified Execution Frame for Repainting
                    if (typeof window.renderNoticesList === 'function') window.renderNoticesList();
                    if (typeof window.injectDashboardNotices === 'function') window.injectDashboardNotices();
                    if (typeof window.renderDashboardTodayRoutine === 'function') window.renderDashboardTodayRoutine();
                    if (typeof window.renderScheduleList === 'function') window.renderScheduleList();
                    if (typeof window.updateDashboardQuickAccessBadges === 'function') window.updateDashboardQuickAccessBadges();
                } finally {
                    if (typeof window.showLoader === 'function') window.showLoader(false);
                    if (typeof window.updateGlobalAvatars === 'function') setTimeout(window.updateGlobalAvatars, 1000);
                }
            };

            const isActualAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);
            const isCR = window.currentUserRole === 'cr';

            const processRouting = async () => {
                let preferredRole = 'student';
                if (isCR) {
                    preferredRole = sessionStorage.getItem('crPreferredRole') || 'student';
                    await crPermissionService.initializePermissions();
                } else {
                    window.currentUserCRBatches = [];
                }

                setTimeout(() => {
                    const btnStudent = document.getElementById('cr-swap-btn-student');
                    const btnAdmin = document.getElementById('cr-swap-btn-admin');
                    const adminLogoRole = document.getElementById('admin-dashboard-logo-role');
                    const adminGreetingRole = document.getElementById('admin-greeting-role');
                    
                    if (isCR) {
                        if (btnStudent) btnStudent.classList.remove('hidden');
                        if (btnAdmin) btnAdmin.classList.remove('hidden');
                        if (adminLogoRole) adminLogoRole.innerText = 'CR';
                        if (adminGreetingRole) adminGreetingRole.innerText = 'CR';
                    } else {
                        if (btnStudent) btnStudent.classList.add('hidden');
                        if (btnAdmin) btnAdmin.classList.add('hidden');
                        if (adminLogoRole) adminLogoRole.innerText = 'Admin';
                        if (adminGreetingRole) adminGreetingRole.innerText = 'Admin';
                    }
                }, 200);

                try {
                    if (isActualAdmin || (isCR && preferredRole === 'cr')) {
                        window.authState.profile.role = (isActualAdmin ? 'admin' : 'cr');
                        window.currentUserRole = String(window.authState.profile.role).toLowerCase();
                        window.navigate('screen-admin-dashboard');
                        if (window.DashboardService && window.DashboardService.applyCRDashboardRestrictions) {
                            window.DashboardService.applyCRDashboardRestrictions();
                        }
                        loadDashboardDataAsync();
                        setTimeout(() => {
                            const cmSection = document.getElementById('admin-content-management-section');
                            if (isCR && cmSection) cmSection.classList.add('hidden');
                            else if (cmSection) cmSection.classList.remove('hidden');
                        }, 100);

                        const portalName = isCR ? "CR Portal" : "Admin Portal";
                        const welcomeName = profile?.full_name || (isCR ? 'Class Representative' : 'System Admin');
                        window.showGlobalToast(portalName, `Welcome back, ${welcomeName}`);
                    } else {
                        if (typeof window.showLoader !== 'undefined') window.showLoader(true, 'Verifying enrollments...');
                        if (window.currentUserCoursesList && window.currentUserCoursesList.length > 0) {
                            if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                            const needsNotificationPrompt = ('Notification' in window) && Notification.permission === 'default' && sessionStorage.getItem('notification_skipped') !== 'true';
                            if (needsNotificationPrompt) {
                                window.navigate('screen-notification-permission');
                            } else {
                                window.navigate('screen-student-dashboard');
                                loadDashboardDataAsync().catch(console.warn);
                                window.triggerUrgentPopupModal();
                                setTimeout(window.startReminderEngine, 2000);
                                window.showGlobalToast("Student Portal", `Welcome back, ${profile?.full_name || 'Fellow'}`);
                            }
                        } else if (window._userCoursesFetchFailed) {
                            if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                            window.showGlobalToast("Network Error", "Could not load your courses. Please check your connection and reload the app.");
                        } else {
                            if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                            window.navigate('screen-onboarding');
                            if (typeof window.loadCourseSelection === 'function') window.loadCourseSelection();
                        }
                    }
                } catch (err) {
                    console.error("[ROUTING ERROR] Caught during user routing:", err);
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    const container = document.getElementById('screen-student-dashboard');
                    if (container) container.innerHTML = '<p class="text-center text-red-500 mt-10 font-bold">Error loading data.</p>';
                }
            };
            await processRouting();
            } finally {
                _isRouting = false;
            }
        }



        let _isCheckingSession = false;
        export async function checkActiveSession() {
            if (_isCheckingSession) {
                console.log("[DEBUG] checkActiveSession already running. Skipping.");
                return;
            }
            _isCheckingSession = true;
            console.log("[DEBUG] checkActiveSession: started");
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Restoring session...");
            try {
                let session = window.authState && window.authState.session;
                
                if (!session) {
                    console.log("[DEBUG] checkActiveSession: calling getSession with timeout");
                    const sessionPromise = _supabase.auth.getSession();
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('getSession timeout')), 10000)
                    );
                    const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);
                    console.log("[DEBUG] checkActiveSession: getSession returned", !!data?.session, error);
                    if (error) throw error;
                    session = data.session;
                } else {
                    console.log("[DEBUG] checkActiveSession: using cached session from onAuthStateChange");
                }

                if (session && session.user) {
                    window.authState.session = session;
                    window.authState.user = session.user;

                    if (window.location.hash.includes('type=recovery') || window.location.hash.includes('recovery_token=')) {
                        console.log("[AUTH] Redirecting to update password screen from session restore.");
                        if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                        window.navigate('screen-update-password');
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                        return;
                    }

                    console.log("[PROFILE FETCH] checkActiveSession: fetching fresh profile");
                    let profileData = await fetchUserProfile(session.user.id).catch(e => {
                        console.warn("[PROFILE] Fetch failed:", e);
                        return null;
                    });
                    console.log(`[PROFILE URL] checkActiveSession: profile_url is ${profileData?.profile_url || 'null'}`);
                    
                    const fallbackRole = window.isAdminEmail(session.user.email) ? 'admin' : 'student';

                    console.log("[PROFILE INIT] checkActiveSession: initializing authState.profile");
                    window.authState.profile = profileData ? profileData : {
                        id: session.user.id,
                        full_name: session.user.user_metadata?.full_name || "MCT Student",
                        email: session.user.email,
                        role: fallbackRole,
                        onboarding_completed: true
                    };

                    if (window.authState.profile && !window.authState.profile.role) {
                        window.authState.profile.role = fallbackRole;
                    }

                    if (typeof window.updateGlobalAvatars === 'function') {
                        window.updateGlobalAvatars();
                    }

                    console.log("[DEBUG] checkActiveSession: calling handleUserRouting");
                    await handleUserRouting(window.authState.user, window.authState.profile);
                    console.log("[DEBUG] checkActiveSession: handleUserRouting completed");
                } else {
                    console.log("[DEBUG] checkActiveSession: no session found");
                    const loginPasswordInput = document.getElementById('login-password');
                    if (loginPasswordInput) {
                        loginPasswordInput.type = 'password';
                        loginPasswordInput.removeAttribute('readonly');
                    }
                    window.currentUserRole = 'student';
                    

                    if (sessionStorage.getItem('pending_registration_state') || localStorage.getItem('pending_signup_email')) {
                        console.log("[AUTH] Pending registration detected, recovering OTP view");
                        window.navigate('screen-confirm-email');
                    } else {
                        window.navigate('screen-welcome');
                    }
                }
            } catch (err) {
                console.log("[DEBUG] checkActiveSession: catch block triggered", err);
                const loginPasswordInput = document.getElementById('login-password');
                if (loginPasswordInput) {
                    loginPasswordInput.type = 'password';
                    loginPasswordInput.removeAttribute('readonly');
                }
                window.currentUserRole = 'student';
                window.navigate('screen-welcome');
            } finally {
                console.log("[DEBUG] checkActiveSession: finally block");
                // Only hide loader if we actually did something and routing isn't still in progress
                // Actually, handleUserRouting manages the loader on success, so we don't always need to hide it here unless it failed.
                // We'll let handleUserRouting hide the loader, except if there's no session or an error.
                if (!window.authState.user || window.currentUserRole === 'student' && !window.authState.profile) {
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                }
                _isCheckingSession = false;
            }
        }
// Sync auth changes instantly
        let isRecovering = false;
        
        if (typeof window.__authListenerCount !== 'undefined') window.__authListenerCount++;
        if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[AUTH INIT]', 'Registering onAuthStateChange listener');
        
        _supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("[AUTH] Auth State Change Event:", event);
            if (event === 'INITIAL_SESSION') return;
            if (_isCheckingSession) {
                console.log("[AUTH] Ignored onAuthStateChange because checkActiveSession is running.");
                return;
            }
            // A1 Fix: Debounce token refresh to prevent UI reload stampede
            if (event === 'SIGNED_IN' && session && window.authState && window.authState.user && window.authState.user.id === session.user.id) {
                console.log("[AUTH] Token refresh detected, updating session only.");
                window.authState.session = session;
                if (typeof window.updateNotificationStatusUI === 'function') window.updateNotificationStatusUI();
                return;
            }
            if (!window.authState) window.authState = { session: null, user: null, profile: null };

            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && window.location.hash.includes('type=recovery'))) {
                isRecovering = true;
                window.authState.session = session;
                window.authState.user = session?.user || null;
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                window.navigate('screen-update-password');
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }
            if (event === 'SIGNED_IN' && session) {
                if (isRecovering || window.location.hash.includes('type=recovery')) {
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    window.navigate('screen-update-password');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    return;
                }
                console.log("[DEBUG] onAuthStateChange: setting auth state");
                window.authState.session = session;
                window.authState.user = session.user;
                
                console.log("[PROFILE FETCH] onAuthStateChange: fetching fresh profile");
                let profileData = await fetchUserProfile(session.user.id).catch(e => {
                    console.warn("[PROFILE] Fetch failed:", e);
                    return null;
                });
                console.log(`[PROFILE URL] onAuthStateChange: profile_url is ${profileData?.profile_url || 'null'}`);
                
                const fallbackRole = window.isAdminEmail(session.user.email) ? 'admin' : 'student';

                console.log("[PROFILE INIT] onAuthStateChange: initializing authState.profile");
                window.authState.profile = profileData ? profileData : {
                    id: session.user.id,
                    full_name: session.user.user_metadata?.full_name || "MCT Student",
                    email: session.user.email,
                    role: fallbackRole,
                    onboarding_completed: true
                };

                if (window.authState.profile && !window.authState.profile.role) {
                    window.authState.profile.role = fallbackRole;
                }

                if (typeof window.updateGlobalAvatars === 'function') {
                    window.updateGlobalAvatars();
                }

                console.log("[DEBUG] onAuthStateChange: routing user...");
                await handleUserRouting(window.authState.user, window.authState.profile);
} else if (event === 'SIGNED_OUT') {
        isRecovering = false;
        window.authState.session = null;
        window.authState.user = null;
        window.authState.profile = null;
        window.currentUserEmail = '';
        window.currentUserName = '';
        window.currentUserRole = 'student';
        sessionStorage.clear();
        console.log("[AUTH] Logged out successfully");
        window.navigate('screen-login');
    }
});

        // Handle iOS PWA visibility resume
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[LIFECYCLE]', 'App resumed from background');
                const { data } = await _supabase.auth.getSession();
                if (data && data.session) {
                    if (!window.authState) window.authState = {};
                    window.authState.session = data.session;
                    window.authState.user = data.session.user;
                    if (window.isScreenActive && window.isScreenActive('screen-student-dashboard') && typeof window.loadDashboardTodayRoutine === 'function') {
                        window.loadDashboardTodayRoutine();
                        if (typeof window.updateDashboardGreetings === 'function') window.updateDashboardGreetings();
                    }
                }
            }
        });



        export async function handleConfirmOTP() {
            try {
                const pendingEmail = localStorage.getItem('pending_signup_email');
                if (!pendingEmail) {
                    window.showGlobalToast('Error', 'No registration found. Please sign up again.');
                    return;
                }
                const codeInput = document.getElementById('confirm-otp-code');
                const code = codeInput ? codeInput.value.trim() : '';
                
                if (!code || code.length !== 6) {
                    window.showGlobalToast('Warning', 'Please enter a valid 6-digit code.');
                    return;
                }
                
                if (typeof window.showLoader === 'function') window.showLoader(true, "Verifying code...");
                
                let data, error, retries = 3;
                while (retries > 0) {
                    try {
                        const res = await _supabase.auth.verifyOtp({
                            email: pendingEmail,
                            token: code,
                            type: 'signup'
                        });
                        // WebKit "Load Failed" network drops often manifest as TypeError or message includes "Load failed" / "Failed to fetch"
                        if (res.error && (res.error.message.includes('Load failed') || res.error.message.includes('Failed to fetch'))) {
                            throw res.error; // Trigger retry for network dropouts
                        }
                        data = res.data;
                        error = res.error;
                        break;
                    } catch (e) {
                        retries--;
                        if (retries === 0) {
                            error = e;
                        } else {
                            console.warn(`[AUTH] Network dropout detected during OTP, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }
                }
                
                if (error) throw error;
                
                console.log("[OTP] Verification success");
                console.log("[OTP] Session created");
                window.showGlobalToast("Success", "Account verified successfully!");
                
                // Save phone number to profile
                const pendingPhone = localStorage.getItem('pending_signup_phone');
                if (pendingPhone && data.user) {
                    await _supabase.from('profiles').update({ phone_number: pendingPhone }).eq('id', data.user.id);
                }
                
                // Clear the pending email as it's no longer needed
                localStorage.removeItem('pending_signup_email');
                localStorage.removeItem('pending_signup_phone');
                
                // Set flag for the welcome notification in the dashboard
                sessionStorage.setItem('isFirstTimeRegistration', 'true');
                
                // Trigger PWA Install Prompt explicitly for new registrations
                if (typeof window.promptInstallPWA === 'function') {
                    setTimeout(() => window.promptInstallPWA(true), 1500);
                }
                
                // Navigation handled automatically by onAuthStateChange background listener
            } catch (err) {
                console.error("[AUTH] Verify OTP error:", err);
                window.showGlobalToast("Warning", err.message || "Invalid, incorrect, or expired code.");
            } finally {
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }



        let isLoggingIn = false;
        export async function handleLogin(event) {
            event.preventDefault();
            if (isLoggingIn) return;
            isLoggingIn = true;
            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const emailError = document.getElementById('login-email-error');
            const errorBanner = document.getElementById('login-error-banner');

            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            if (emailError) emailError.classList.add('hidden');
            if (errorBanner) errorBanner.classList.add('hidden');

            if (typeof window.validateDIUEmail === 'function' && !validateDIUEmail(email)) {
                if (emailError) emailError.classList.remove('hidden');
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Authentication Error", "Only valid MCT (xxx-40-xxx) emails allowed.");
                return;
            }

            if (typeof window.showLoader === 'function') window.showLoader(true, "Logging in, please wait...");
            try {
                const { data, error } = await _supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                if (error) throw error;
            } catch (err) {
                console.error("[AUTH] Login error:", err);
                if (errorBanner) {
                    errorBanner.innerText = err.message || "Invalid credentials.";
                    errorBanner.classList.remove('hidden');
                }
            } finally {
                isLoggingIn = false;
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }



        export async function handleRegister(event) {
            console.log('[REGISTER] Form submit started');
            if (event) event.preventDefault();
            console.log('[REGISTER] preventDefault executed');
            if (isRegistering) return;
            isRegistering = true;
            
            const nameInput = document.getElementById('register-name');
            const emailInput = document.getElementById('register-email');
            const passwordInput = document.getElementById('register-password');
            const phoneInput = document.getElementById('register-phone');
            const emailError = document.getElementById('register-email-error');
            const passError = document.getElementById('register-password-error');
            const phoneError = document.getElementById('register-phone-error');
            const errorBanner = document.getElementById('register-error-banner');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';
            const phone = phoneInput ? phoneInput.value.trim() : '';

            if (emailError) emailError.classList.add('hidden');
            if (passError) passError.classList.add('hidden');
            if (phoneError) phoneError.classList.add('hidden');
            if (errorBanner) errorBanner.classList.add('hidden');

            if (typeof window.validateDIUEmail === 'function' && !validateDIUEmail(email)) {
                if (emailError) emailError.classList.remove('hidden');
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Must use a valid DIU MCT email format.");
                isRegistering = false;
                return;
            }
            if (password.length < 8) {
                if (passError) passError.classList.remove('hidden');
                isRegistering = false;
                return;
            }
            if (!/^01\d{9}$/.test(phone)) {
                if (phoneError) phoneError.classList.remove('hidden');
                isRegistering = false;
                return;
            }

            console.log('[REGISTER] Calling signUp');
            if (typeof window.showLoader === 'function') window.showLoader(true, "Creating account...");
            try {
                const { data, error } = await _supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: name,
                            role: 'student'
                        }
                    }
                });
                if (error) throw error;
                
                console.log('[REGISTER] signUp success');
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Success", "Account created successfully. Please enter the verification code sent to your email.");
                localStorage.setItem('pending_signup_email', email);
                localStorage.setItem('pending_signup_phone', phone);
                sessionStorage.setItem('pending_registration_state', JSON.stringify({ name, email, password, phone }));
                
                console.log('[REGISTER] Navigating to OTP');
                if (typeof window.navigate === 'function') window.navigate('screen-confirm-email');
                console.log('[REGISTER] OTP page rendered');
                if (typeof window.startResendCooldown === 'function') window.startResendCooldown();
            } catch (err) {
                console.error("[AUTH] Register error:", err);
                if (errorBanner) {
                    errorBanner.innerText = err.message || "An unexpected error occurred.";
                    errorBanner.classList.remove('hidden');
                }
            } finally {
                if (typeof window.showLoader === 'function') window.showLoader(false);
                isRegistering = false;
            }
        }

        let isForgotSubmitting = false;
        export async function handleForgot(event) {
            if (event) event.preventDefault();
            if (isForgotSubmitting) return;
            isForgotSubmitting = true;
            
            const emailInput = document.getElementById('forgot-email');
            const emailError = document.getElementById('forgot-email-error');
            const email = emailInput ? emailInput.value.trim() : '';

            if (emailError) emailError.classList.add('hidden');

            if (typeof window.validateDIUEmail === 'function' && !validateDIUEmail(email)) {
                if (emailError) emailError.classList.remove('hidden');
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Must use a valid DIU MCT email format.");
                isForgotSubmitting = false;
                return;
            }

            if (typeof window.showLoader === 'function') window.showLoader(true, "Sending recovery code...");
            try {
                const { error } = await _supabase.auth.resetPasswordForEmail(email);
                if (error) throw error;
                
                // Save email to localStorage for the next step
                localStorage.setItem('pending_recovery_email', email);
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Success", "Recovery code sent to your email.");
                
                if (typeof window.navigate === 'function') {
                    window.navigate('screen-recovery-otp');
                }
            } catch (err) {
                console.error("[AUTH] Forgot password error:", err);
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", err.message || "Failed to send recovery code.");
            } finally {
                isForgotSubmitting = false;
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }

        export async function handleRecoveryOtp() {
            const otpInput = document.getElementById('recovery-otp-code');
            const token = otpInput ? otpInput.value.trim() : '';
            const email = localStorage.getItem('pending_recovery_email');

            if (!email) {
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Email not found. Please restart recovery.");
                if (typeof window.navigate === 'function') window.navigate('screen-forgot');
                return;
            }

            if (token.length !== 6) {
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Please enter the 6-digit code.");
                return;
            }

            if (typeof window.showLoader === 'function') window.showLoader(true, "Verifying code...");
            try {
                const { data, error } = await _supabase.auth.verifyOtp({
                    email: email,
                    token: token,
                    type: 'recovery'
                });
                if (error) throw error;

                // Session is now active. We can proceed to update password screen.
                localStorage.removeItem('pending_recovery_email');
                if (typeof window.navigate === 'function') {
                    window.navigate('screen-update-password');
                }
            } catch (err) {
                console.error("[AUTH] Verify recovery OTP error:", err);
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", err.message || "Invalid or expired code.");
            } finally {
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }

        let isUpdatingPassword = false;
        export async function handleUpdatePassword(event) {
            if (event) event.preventDefault();
            if (isUpdatingPassword) return;
            isUpdatingPassword = true;

            const passwordInput = document.getElementById('new-password');
            const errorBanner = document.getElementById('update-password-error-banner');
            const password = passwordInput ? passwordInput.value : '';

            if (errorBanner) errorBanner.classList.add('hidden');

            if (password.length < 8) {
                if (errorBanner) {
                    errorBanner.innerText = "Password must be at least 8 characters.";
                    errorBanner.classList.remove('hidden');
                }
                isUpdatingPassword = false;
                return;
            }

            if (typeof window.showLoader === 'function') window.showLoader(true, "Updating password...");
            try {
                const { error } = await _supabase.auth.updateUser({
                    password: password
                });
                if (error) throw error;

                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Success", "Password updated successfully.");
                
                // Ensure profile is loaded then navigate to dashboard
                await checkActiveSession();
            } catch (err) {
                console.error("[AUTH] Update password error:", err);
                if (errorBanner) {
                    errorBanner.innerText = err.message || "Failed to update password.";
                    errorBanner.classList.remove('hidden');
                }
            } finally {
                isUpdatingPassword = false;
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }


        export async function logout() {
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Ending session...");

            const deviceId = localStorage.getItem('mct_device_id');
            if (deviceId) {
                try {
                    await _supabase.from('device_tokens').delete().eq('device_id', deviceId);
                    console.log("[TOKEN DELETE] Removed token for device ID:", deviceId);
                    sessionStorage.removeItem('token_registered');
                } catch(e) {
                    console.warn("[TOKEN DELETE] Cleanup failed", e);
                }
            }

            try { await _supabase.auth.signOut(); } catch (e) { }

            // PART 13: Stop reminder engine and clear session data
            if (typeof window.stopReminderEngine === 'function') window.stopReminderEngine();
            window.currentSchedulesList = [];

            // Clear Stores Cache
            if (CourseStore && CourseStore.cache) CourseStore.cache = null;
            if (FacultyStore && FacultyStore.cache) FacultyStore.cache = null;
            if (RoutineStore && RoutineStore.cache) RoutineStore.cache = null;
            if (NotificationStore) NotificationStore.unreadCount = 0;
            if (ProfileStore && ProfileStore.cache) ProfileStore.cache = null;

            // Clear Sensitive data
            localStorage.removeItem('pending_signup_email');
            localStorage.removeItem('pending_signup_phone');

            window.currentUserEmail = '';
            window.currentUserName = '';
            window.currentUserRole = 'student';
            window.currentViewedFacultyId = null;
            window.selectedFaculty = null;
            localStorage.removeItem('mct_urgent_notice_shown_once');

            setTimeout(() => {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                const loginPasswordInput = document.getElementById('login-password');
                if (loginPasswordInput) {
                    loginPasswordInput.type = 'password';
                    loginPasswordInput.removeAttribute('readonly');
                }
                window.navigate('screen-login');
                window.showGlobalToast("Logged Out", "Session destroyed successfully.");
            }, 800);
        }




export const AuthService = {
    fetchUserProfile,
    handleUserRouting,
    checkActiveSession,
    handleConfirmOTP,
    handleLogin,
    handleRegister,
    logout
};
console.log("[ARCHITECTURE]\nauth loaded");



