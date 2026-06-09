import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

let _isRouting = false;
let isRegistering = false;

        export async function fetchUserProfile(userId) {
            try {
                const profilePromise = _supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();
                    
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('fetchUserProfile timeout')), 15000)
                );
                
                const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

                if (error) {
                    console.error('Error fetching profile from Supabase:', error.message);
                    return null;
                }
                return data;
            } catch (err) {
                console.error('Exception caught in fetchUserProfile:', err);
                return null;
            }
        }



        export async function handleUserRouting(user, profile) {
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
                const coursesPromise = _supabase.from('user_courses').select('*').eq('user_id', user.id);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('user_courses timeout')), 15000));
                const { data: userCourses, error } = await Promise.race([coursesPromise, timeoutPromise]);
                if (error) throw error;
                window.currentUserCoursesList = userCourses || [];
            } catch (e) { console.warn("[ROUTING] user_courses fetch failed or timed out:", e); }

            const loadDashboardDataAsync = async () => {
                if (typeof window.loadContentSettings === 'function') await window.loadContentSettings().catch(console.warn);
                if (typeof window.loadNotices === 'function') await window.loadNotices().catch(console.warn);
                if (typeof window.updateGlobalAvatars === 'function') setTimeout(window.updateGlobalAvatars, 1000);
            };

            const isActualAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);

            if (isActualAdmin) {
                // Determine preferred view (default to student if first time)
                const preferredRole = localStorage.getItem('adminPreferredRole') || 'student';
                window.authState.profile.role = preferredRole;
                window.currentUserRole = preferredRole;

                const toggleOnStudent = document.getElementById('admin-switch-on-student');
                const toggleOnAdmin = document.getElementById('admin-switch-on-admin');
                if (toggleOnStudent) toggleOnStudent.classList.remove('hidden');
                if (toggleOnAdmin) toggleOnAdmin.classList.remove('hidden');

                if (preferredRole === 'student') {
                    window.navigate('screen-student-dashboard');
                    window.updateDashboardGreetings();
                    loadDashboardDataAsync();
                    if (typeof window.loadDashboardTodayRoutine === 'function') window.loadDashboardTodayRoutine().catch(console.warn);
                    if (typeof window.loadScheduleList === 'function') window.loadScheduleList().catch(console.warn);
                    setTimeout(window.startReminderEngine, 2000);
                    window.showGlobalToast("Student Portal", `Welcome back, ${profile?.full_name || 'System Admin'}`);
                } else {
                    window.navigate('screen-admin-dashboard');
                    window.updateDashboardGreetings();
                    loadDashboardDataAsync();
                    window.showGlobalToast("Admin Portal", `Welcome back Admin, ${profile?.full_name || 'System Admin'}`);
                }
            } else {
                const toggleOnStudent = document.getElementById('admin-switch-on-student');
                const toggleOnAdmin = document.getElementById('admin-switch-on-admin');
                if (toggleOnStudent) toggleOnStudent.classList.add('hidden');
                if (toggleOnAdmin) toggleOnAdmin.classList.add('hidden');

                // Onboarding Logic: Check if user has enrolled courses
                if (typeof window.showLoader !== 'undefined') window.showLoader(true, 'Verifying enrollments...');
                try {
                    if (window.currentUserCoursesList && window.currentUserCoursesList.length > 0) {
                        if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                        const needsNotificationPrompt = ('Notification' in window) && Notification.permission === 'default' && sessionStorage.getItem('notification_skipped') !== 'true';
                        if (needsNotificationPrompt) {
                            window.navigate('screen-notification-permission');
                        } else {
                            window.navigate('screen-student-dashboard');
                            window.updateDashboardGreetings();
                            loadDashboardDataAsync().catch(console.warn);
                            window.triggerUrgentPopupModal();
                            if (typeof window.loadDashboardTodayRoutine === 'function') window.loadDashboardTodayRoutine().catch(console.warn);
                            if (typeof window.loadScheduleList === 'function') window.loadScheduleList().catch(console.warn);
                            setTimeout(window.startReminderEngine, 2000); // PART 10
                            window.showGlobalToast("Student Portal", `Welcome back, ${profile?.full_name || 'Fellow'}`);
                        }
                    } else {
                        if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                        window.navigate('screen-onboarding');
                        if (typeof window.loadCourseSelection === 'function') window.loadCourseSelection();
                    }
                } catch (err) {
                    console.error("[ROUTING ERROR] Caught during user routing:", err);
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    window.navigate('screen-student-dashboard'); // Failsafe
                    window.updateDashboardGreetings();
                }
            }
            } finally {
                _isRouting = false;
            }
        }



        export async function checkActiveSession() {
            console.log("[DEBUG] checkActiveSession: started");
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Restoring session...");
            try {
                let session = window.authState && window.authState.session;
                
                if (!session) {
                    console.log("[DEBUG] checkActiveSession: calling getSession with timeout");
                    const sessionPromise = _supabase.auth.getSession();
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('getSession timeout')), 15000)
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

                    window.authState.profile = {
                        id: session.user.id,
                        full_name: session.user.user_metadata?.full_name || "MCT Student",
                        email: session.user.email,
                        role: window.isAdminEmail(session.user.email) ? 'admin' : 'student',
                        onboarding_completed: true
                    };
                    
                    console.log("[DEBUG] checkActiveSession: starting background fetchUserProfile");
                    fetchUserProfile(session.user.id).then(profileData => {
                        if (profileData) {
                            window.authState.profile = profileData;
                            if (typeof window.updateGlobalAvatars === 'function') {
                                window.updateGlobalAvatars();
                            }
                        }
                    }).catch(e => console.warn("[PROFILE] Background fetch failed:", e));

                    console.log("[DEBUG] checkActiveSession: calling handleUserRouting");
                    await handleUserRouting(window.authState.user, window.authState.profile);
                    console.log("[DEBUG] checkActiveSession: handleUserRouting completed");
                } else {
                    console.log("[DEBUG] checkActiveSession: no session found");
                    window.currentUserRole = 'student';
                    window.navigate('screen-welcome');
                }
            } catch (err) {
                console.log("[DEBUG] checkActiveSession: catch block triggered", err);
                window.currentUserRole = 'student';
                window.navigate('screen-welcome');
            } finally {
                console.log("[DEBUG] checkActiveSession: finally block");
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        }
// Sync auth changes instantly
        let isRecovering = false;
        _supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("[AUTH] Auth State Change Event:", event);
            if (event === 'INITIAL_SESSION') return;
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
                window.authState.profile = {
                    id: session.user.id,
                    full_name: session.user.user_metadata?.full_name || "MCT Student",
                    email: session.user.email,
                    role: window.isAdminEmail(session.user.email) ? 'admin' : 'student',
                    onboarding_completed: true
                };

                console.log("[DEBUG] onAuthStateChange: starting background profile fetch");
                fetchUserProfile(session.user.id).then(profileData => {
                    if (profileData) {
                        window.authState.profile = profileData;
                        if (typeof window.updateGlobalAvatars === 'function') {
                            window.updateGlobalAvatars();
                        }
                    }
                }).catch(e => console.warn("[PROFILE] Background fetch failed:", e));

                console.log("[DEBUG] onAuthStateChange: routing");
                handleUserRouting(window.authState.user, window.authState.profile).catch(console.warn);
                console.log("[DEBUG] onAuthStateChange: routing done");
            } else if (event === 'SIGNED_OUT') {
        isRecovering = false;
        window.authState.session = null;
        window.authState.user = null;
        window.authState.profile = null;
        window.currentUserEmail = '';
        window.currentUserName = '';
        window.currentUserRole = 'student';
        window.navigate('screen-login');
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
                
                const { data, error } = await _supabase.auth.verifyOtp({
                    email: pendingEmail,
                    token: code,
                    type: 'signup'
                });
                
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
