        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
        import { getMessaging, getToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

        const firebaseConfig = {
            apiKey: "AIzaSyDBZj8DiQjd7KQyElLQ2ZC7IINJLPvebQU",
            authDomain: "notify---cms.firebaseapp.com",
            projectId: "notify---cms",
            storageBucket: "notify---cms.firebasestorage.app",
            messagingSenderId: "752160385235",
            appId: "1:752160385235:web:fefc78032ac6c2906acc26"
        };

        const VAPID_KEY = "BAGrU4ReZe_326DRm9BRnPpFF7KQqBv0BQ2ShrG-AJ_QWd4Sn3auLqDy9ONt0yW2DqgtZrmF4_EJVaR30t0d_hw";

        let app;
        let messaging;
        
        let _firebaseInitPromise = null;
        let _serviceWorkerRegistrationPromise = null;

        async function ensureServiceWorkerRegistered() {
            if (!('serviceWorker' in navigator)) {
                console.warn('[FCM SW REGISTERED] Unsupported environment: serviceWorker not in navigator.');
                return null;
            }
            if (_serviceWorkerRegistrationPromise) return _serviceWorkerRegistrationPromise;

            if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[SW REGISTER]', 'Initiating SW registration');
            if (typeof window.__serviceWorkerRegisterCount !== 'undefined') window.__serviceWorkerRegisterCount++;

            _serviceWorkerRegistrationPromise = navigator.serviceWorker.register('./firebase-messaging-sw.js?v=10')
                .then(async (registration) => {
                    console.log('[FCM SW REGISTERED] Service Worker registration success with scope:', registration.scope);
                    if (document.getElementById('diag-sw')) document.getElementById('diag-sw').innerText = 'Registered';
                    await navigator.serviceWorker.ready;
                    return registration;
                })
                .catch((swErr) => {
                    console.error('[FCM SW REGISTERED] Service Worker registration failure:', swErr);
                    _serviceWorkerRegistrationPromise = null; // allow retry
                    return null;
                });
            return _serviceWorkerRegistrationPromise;
        }

        async function initFirebase() {
            if (typeof window.__FORENSIC_TRACER === 'function') window.__FORENSIC_TRACER('INIT_FIREBASE');
            if (typeof window.__FIREBASE_COUNT !== 'undefined') window.__FIREBASE_COUNT++;
            if (_firebaseInitPromise) return _firebaseInitPromise;

            _firebaseInitPromise = (async () => {
                try {
                    if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[FIREBASE INIT]', 'Starting initialization');
                    if (typeof window.__firebaseInitCount !== 'undefined') window.__firebaseInitCount++;
                    console.log("[FIREBASE] Starting initialization...");
                    
                    const supported = await isSupported();
                    if (!supported) {
                        console.warn("[FIREBASE] Environment does not support Firebase Messaging.");
                        return false;
                    }

                    if (!app) {
                        app = initializeApp(firebaseConfig);
                        console.log("[FIREBASE] App initialized successfully");
                    }

                    if (!messaging) {
                        try {
                            messaging = getMessaging(app);
                            console.log("[FIREBASE] Messaging initialized successfully");
                            if (typeof window.__LIFECYCLE_DEBUG__ === 'function') window.__LIFECYCLE_DEBUG__('[MESSAGING INIT]', 'Messaging instance created');
                        } catch (e) {
                            console.log("[FIREBASE] Messaging initialization failed (likely unsupported iOS environment):", e.message);
                            return false;
                        }
                    }

                onMessage(messaging, async (payload) => {
                    console.log('[FIREBASE FOREGROUND]', payload);

                    // SECURITY TRACE: Fetch student credentials from Cache Storage
                    let accessGranted = true;
                    const target_type = payload?.data?.target_type;
                    const target_id = payload?.data?.target_id;

                    if (target_type) {
                        accessGranted = false; // Default strictly deny if target data is present
                        try {
                            if ('caches' in window) {
                                const cache = await caches.open('mct-profile-rules');
                                const res = await cache.match('/rules.json');
                                if (res) {
                                    const rules = await res.json();
                                    
                                    console.log('[MAIN SECURITY TRACE]', {
                                        studentMainBatch: rules.profileBatchId,
                                        targetType: target_type,
                                        targetId: target_id
                                    });
                                    
                                    if (target_type === 'course_students') {
                                        if (rules.studentCourses && rules.studentCourses.includes(target_id)) accessGranted = true;
                                    } else if (target_type === 'batch_students') {
                                        // STRICT BATCH OWNERSHIP ONLY
                                        if (rules.ownedBatches && rules.ownedBatches.includes(target_id)) accessGranted = true;
                                    } else if (target_type === 'all_students') {
                                        if (!target_id) {
                                            accessGranted = true; // Global admin notice
                                        } else if (
                                            (rules.ownedBatches && rules.ownedBatches.includes(target_id)) || 
                                            (rules.courseEnrolledBatches && rules.courseEnrolledBatches.includes(target_id))
                                        ) {
                                            accessGranted = true;
                                        }
                                    } else if (target_type === 'specific_student') {
                                        if (rules.userId && rules.userId === target_id) accessGranted = true;
                                    } else if (target_type === 'all') {
                                        accessGranted = true;
                                    }
                                } else {
                                    console.warn('[MAIN SECURITY TRACE] Cache rules missing. Access strictly denied by default.');
                                }
                            }
                        } catch (e) {
                            console.warn('[MAIN SECURITY TRACE] Evaluation error:', e);
                        }
                    }

                    if (!accessGranted) {
                        console.log('[MAIN SECURITY TRACE] Access Denied. Foreground payload dropped.');
                        return;
                    }

                    console.log('[FIREBASE FOREGROUND] Message received manually displaying system notification:', payload);
                      const title = payload.notification?.title || payload.data?.title || "MCT Notify";
                      const body = payload.notification?.body || payload.data?.body || "You have a new update.";
                      const icon = payload.notification?.icon || payload.data?.icon || '/assets/Logo.png';
                      
                      if (typeof window.showNotificationToast === 'function') {
                          window.showNotificationToast(title, body, payload);
                      } else if (window.showGlobalToast) {
                          window.showGlobalToast(title, body);
                      }
                    
                    if (Notification.permission === 'granted') {
                        try {
                            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                                navigator.serviceWorker.ready.then(registration => {
                                    registration.showNotification(title, {
                                        body: body,
                                        icon: icon,
                                        badge: '/assets/badge.png',
                                        data: payload
                                    });
                                }).catch(err => {
                                    console.warn('[FIREBASE FOREGROUND] Service worker showNotification failed, using fallback:', err);
                                    new Notification(title, { body: body, icon: icon });
                                });
                            } else {
                                new Notification(title, { body: body, icon: icon });
                            }
                        } catch (e) {
                            console.warn('[FIREBASE FOREGROUND] System notification failed:', e);
                            window.updateNotificationStatusUI();
                        }
                    }
                });
                    
                    return true;
                } catch (err) {
                    console.error('[FIREBASE] Full initialization failed:', err);
                    return false;
                }
            })();
            return _firebaseInitPromise;
        }

        async function saveDeviceTokenToSupabase(token) {
            try {
                let deviceId = localStorage.getItem('mct_device_id');
                if (!deviceId) {
                    deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'dev-' + Math.random().toString(36).substr(2, 9);
                    localStorage.setItem('mct_device_id', deviceId);
                }
                if (sessionStorage.getItem('token_registered') === token) {
                    console.log('[FCM TOKEN SAVE] Token already registered in this session. Skipping DB upsert.');
                    if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Generated & Linked';
                    return;
                }
        
                console.log('[FCM TOKEN UPSERT] Preparing to save token to database with Device UUID:', deviceId);
                const { data: { session } } = await window._supabase.auth.getSession();
        
                if (!session || !session.user) {
                    console.error('[FCM TOKEN SAVE] Cannot save token: Supabase session is empty.');
                    return;
                }
                
                const fullName = session.user.user_metadata?.full_name || 'Student';
        
                // Upsert using device_id as the conflict resolution target
                const { error } = await window._supabase
                    .from('device_tokens')
                    .upsert(
                        { 
                            device_id: deviceId,
                            user_id: session.user.id, 
                            token: token,
                            name: fullName
                        }, 
                        { onConflict: 'device_id' }
                    );
        
                if (error) {
                    console.error('[FCM TOKEN UPSERT FAILURE] Token upsert failure:', error.message);
                } else {
                    console.log('[FCM TOKEN UPSERT SUCCESS] Token upsert success! Device linked uniquely.');
                    sessionStorage.setItem('token_registered', token);
                    if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Generated & Linked';
                }
            } catch (err) {
                console.error('[FCM TOKEN UPSERT FAILURE] Token upsert failure:', err);
            }
        }

        window.requestNotificationPermission = async function () {
            try {
                // iOS / Safari detection for Push support
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

                if (isIOS && isSafari && !isStandalone) {
                    window.showGlobalToast("Requires PWA", "To receive notifications on iOS, please tap 'Share' then 'Add to Home Screen', and launch the app from there.");
                    return;
                }

                if (!messaging) {
                    const initialized = await initFirebase();
                    if (!initialized) return;
                }

                console.log("[FCM SW REGISTERED] Registering Service Worker started...");
                const registration = await ensureServiceWorkerRegistered();
                if (!registration) return;

                if (!('Notification' in window)) {
                    window.showGlobalToast("Unsupported", "Notifications are only supported if you add this app to your Home Screen.");
                    return;
                }
                console.log(`[FCM PERMISSION] Current Notification permission state: ${Notification.permission}`);
                
                if (Notification.permission === 'denied') {
                    window.showGlobalToast("Notifications Blocked", "Please go to your Browser Settings (Site Settings) and allow Notifications for this site.");
                    return;
                }

                const permission = await Notification.requestPermission();

                if (permission === 'granted') {
                    console.log('[FCM PERMISSION] Notification permission granted state.');
                    if (document.getElementById('diag-perm')) document.getElementById('diag-perm').innerText = 'Granted';
                    console.log('[FCM TOKEN GENERATED] Token generation start...');
                    try {
                        const token = await getToken(messaging, {
                            vapidKey: VAPID_KEY,
                            serviceWorkerRegistration: registration
                        });

                        if (token) {
                            console.log('[FCM TOKEN GENERATED] Token generation success:', token);
                            await saveDeviceTokenToSupabase(token);
                        } else {
                            console.warn('[FCM TOKEN GENERATED] Token generation failure: returned null or empty.');
                            if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Generation Failed';
                        }
                    } catch (tokenErr) {
                        console.error('[FCM TOKEN GENERATED] Token generation failure (Firebase error):', tokenErr);
                    }
                } else {
                    console.warn('[FCM PERMISSION] Notification permission denied state.');
                    window.showGlobalToast("Notifications Blocked", "Please go to your Browser Settings (Site Settings) and allow Notifications for this site.");
                }
            } catch (err) {
                console.error('[FIREBASE] Error during notification request process:', err);
            }
        };

        let _hasRunSilentInit = false;
        window.silentNotificationInit = async function () {
            if (typeof window.__FORENSIC_TRACER === 'function') window.__FORENSIC_TRACER('SILENT_NOTIFICATION_INIT');
            if (_hasRunSilentInit) return;
            _hasRunSilentInit = true;
            if (Notification.permission !== 'granted') {
                if (document.getElementById('diag-sw')) document.getElementById('diag-sw').innerText = 'Denied / Blocked';
                if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'N/A';
                return;
            }
            try {
                if (!messaging) {
                    const initialized = await initFirebase();
                    if (!initialized) {
                        if (document.getElementById('diag-sw')) document.getElementById('diag-sw').innerText = 'Unavailable';
                        if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Unsupported';
                        return;
                    }
                }
                const registration = await ensureServiceWorkerRegistered();
                if (!registration) return;
                
                console.log('[FCM TOKEN GENERATED] Token generation start (Silent)...');
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration
                });
                if (token) {
                    console.log('[FCM TOKEN GENERATED] Token generation success (Silent):', token);
                    await saveDeviceTokenToSupabase(token);
                }
            } catch (err) {
                console.error('[FIREBASE SILENT INIT ERROR]', err);
            }
        };



        // Add global triggerImmediateNotification
        window.triggerImmediateNotification = async function(type, id, title, message) {
            try {
                if (!window.authState || !window.authState.user) return;
                console.log(`[PUSH] Triggering immediate push notification for ${type} ${id}`);

                let safeTitle = typeof title === 'string' ? title : null;
                let safeMessage = typeof message === 'string' ? message : null;

                // If the title is an object (like '{}'), missing, or undefined, fetch it safely from the database!
                if (!safeTitle || safeTitle === '[object Object]' || typeof title === 'object') {
                    let tableName = 'notices';
                    if (type === 'schedule') tableName = 'schedules';
                    if (type === 'routine') tableName = 'routines';
                    if (type === 'material') tableName = 'materials';
                    if (type === 'exam' || type === 'exam_schedules') tableName = 'exam_schedules';

                    const { data } = await window._supabase.from(tableName).select('*').eq('id', id).single();
                    
                    if (data) {
                        if (tableName === 'exam_schedules') {
                            const formattedDate = new Date(data.exam_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const formattedTime = window.formatTimeIfPossible ? window.formatTimeIfPossible(data.start_time) : data.start_time;
                            safeTitle = `📝 Exam: '${data.course_name}'`;
                            safeMessage = `Upcoming Exam is '${data.course_name}' at '${formattedDate} & ${formattedTime}'. Open the app to see the syllabus.`;
                        } else {
                            safeTitle = data.title || data.course_title || data.subject || 'MCT Update';
                            safeMessage = data.message || data.description || data.room_no || 'Check the app for details.';
                        }
                    } else {
                        safeTitle = 'MCT Update';
                        safeMessage = 'New notification received.';
                    }
                }

                const payload = {
                    parent_type: type,
                    parent_id: id,
                    reminder_time: new Date(Date.now() + 30000).toISOString(), 
                    sent: false,
                    reminder_title: safeTitle,
                    reminder_message: safeMessage || '',
                    created_by: window.authState.user.id
                };

                const { error } = await window._supabase.from('notification_reminders').insert([payload]);
                
                if (error) {
                    console.error("[PUSH] Failed to trigger immediate notification:", error);
                    if (window.showGlobalToast) window.showGlobalToast("Error", "Failed to send notification.");
                } else {
                    console.log("[PUSH] Immediate notification queued successfully.");
                    if (window.showGlobalToast) window.showGlobalToast("Sent", "Notification sent successfully.");
                }
            } catch (err) {
                console.error("[PUSH] Exception triggering immediate notification:", err);
            }
        };

        // Fill diagnostics on load
        setInterval(() => {
            try {
                const diagPerm = document.getElementById('diag-perm');
                if (diagPerm) {
                    diagPerm.innerText = ('Notification' in window) ? Notification.permission : 'Unsupported';
                    if (document.getElementById('diag-os')) document.getElementById('diag-os').innerText = navigator.platform;
                    
                    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
                    if (document.getElementById('diag-pwa')) document.getElementById('diag-pwa').innerText = isStandalone ? 'Yes' : 'No';
                    
                    if (navigator.serviceWorker) {
                        navigator.serviceWorker.getRegistration().then(reg => {
                            if (reg && reg.active) {
                                if (document.getElementById('diag-sw')) document.getElementById('diag-sw').innerText = 'Active';
                            }
                        });
                    }

                    if (messaging && typeof getToken === 'function') {
                        getToken(messaging, { vapidKey: VAPID_KEY }).then(t => {
                            if (t && document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Generated & Linked';
                        }).catch(e => {
                            if (document.getElementById('diag-token')) document.getElementById('diag-token').innerText = 'Missing/Error';
                        });
                    }
                }
            } catch(e) { console.warn("Diag interval error", e); }
        }, 3000);


        

        window.grantNotificationPermission = async function() {
            if (!('Notification' in window)) {
                window.showGlobalToast("Unsupported", "Notifications are only supported if you add this app to your Home Screen.");
                return;
            }
            if (Notification.permission === 'denied') {
                if (typeof window.openPermissionGuideModal === 'function') {
                    window.openPermissionGuideModal();
                } else {
                    window.showGlobalToast("Notifications Blocked", "Please open your Browser Settings (Site Settings) and allow notifications for this site.");
                }
                return;
            }
            if (typeof window.requestNotificationPermission === 'function') {
                await window.requestNotificationPermission();
            }
            finishNotificationPermissionFlow();
        };

        window.skipNotificationPermission = function() {
            sessionStorage.setItem('notification_skipped', 'true');
            finishNotificationPermissionFlow();
        };

        function finishNotificationPermissionFlow() {
            if ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr')) {
                window.navigate('screen-admin-dashboard');
            } else {
                window.navigate('screen-student-dashboard');
            }
            if (typeof window.loadDashboardDataAsync === 'function') window.loadDashboardDataAsync();
            if (typeof window.triggerUnseenUpdatesPopup === 'function') window.triggerUnseenUpdatesPopup();
            updateNotificationStatusUI();
        }

        window.updateNotificationStatusUI = function() {
            let hasPermission = false;
            let isDenied = false;
            if ('Notification' in window) {
                hasPermission = Notification.permission === 'granted';
                isDenied = Notification.permission === 'denied';
            }
            
            // Dashboard Red Dots
            const dashboardAlerts = document.querySelectorAll('.global-notification-alert');
            dashboardAlerts.forEach(alert => {
                if (!hasPermission) alert.classList.remove('hidden');
                else alert.classList.add('hidden');
            });

            // Profile Page Alert
            const profileAlert = document.getElementById('profile-notification-alert');
            if (profileAlert) {
                if (!hasPermission) {
                    profileAlert.classList.remove('hidden');
                    const textEl = profileAlert.querySelector('p');
                    const btn = profileAlert.querySelector('button');
                    if (isDenied) {
                        if (textEl) textEl.innerText = "Notifications are blocked. Please allow them in your Browser Settings.";
                        if (btn) btn.innerText = "Check Settings";
                    } else {
                        if (textEl) textEl.innerText = "Enable notification permission for better experience.";
                        if (btn) btn.innerText = "Enable Now";
                    }
                } else {
                    profileAlert.classList.add('hidden');
                }
            }
        };



        // ----------------------------------------------------
        // NOTIFICATION CENTER LOGIC
        // ----------------------------------------------------
        let globalUserNoticeReads = new Set();
        let notificationCenterNotices = [];

        window.fetchNotificationCenterNotices = async function() {
            if (!window.authState.user) return;
            try {
                const { data: reads } = await _supabase.from('user_notice_reads').select('notice_id').eq('user_id', window.authState.user.id);
                if (reads) {
                    globalUserNoticeReads = new Set(reads.map(r => r.notice_id));
                }

                notificationCenterNotices = [...currentNoticesList].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                updateNotificationBadge();
            } catch (e) {
                console.error("[NOTIFICATIONS] Error fetching reads:", e);
            }
        };

        function updateNotificationBadge() {
            let unreadCount = 0;
            notificationCenterNotices.forEach(n => {
                if (!globalUserNoticeReads.has(n.id)) unreadCount++;
            });

            const badges = document.querySelectorAll('.dashboard-bell-badge');
            const counts = document.querySelectorAll('.dashboard-bell-count');
            
            if (unreadCount > 0) {
                badges.forEach(b => b.classList.remove('hidden'));
                counts.forEach(c => c.innerText = unreadCount > 99 ? '99+' : unreadCount);
            } else {
                badges.forEach(b => b.classList.add('hidden'));
            }
        }

        window.openNotificationCenter = function() {
            const modal = document.getElementById('notification-center-modal');
            const panel = document.getElementById('notification-center-panel');
            if(modal && panel) {
                modal.classList.remove('hidden');
                modal.style.opacity = '0';
                modal.style.transition = 'opacity 0.3s ease';
                setTimeout(() => {
                    modal.style.opacity = '1';
                    panel.classList.remove('translate-x-full');
                    panel.classList.add('translate-x-0');
                }, 10);
                
                // 1. Render instantly using cached data
                renderNotificationCenter();
                
                // 2. Silently fetch latest state and update in background
                if (typeof window.fetchNotificationCenterNotices === 'function') {
                    window.fetchNotificationCenterNotices().then(() => {
                        renderNotificationCenter();
                    }).catch(console.warn);
                }
            }
            if(typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.closeNotificationCenter = function() {
            const modal = document.getElementById('notification-center-modal');
            const panel = document.getElementById('notification-center-panel');
            if(modal && panel) {
                panel.classList.remove('translate-x-0');
                panel.classList.add('translate-x-full');
                modal.style.opacity = '0';
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            }
        };

        function renderNotificationCenter() {
            const container = document.getElementById('notification-center-list');
            if (!container) return;
            
            if (notificationCenterNotices.length === 0) {
                container.innerHTML = `<div class="py-10 flex flex-col items-center justify-center text-center">
                    <i data-lucide="bell-off" class="w-10 h-10 text-slate-300 mb-3"></i>
                    <p class="text-slate-500 dark:text-dark-textSecondary font-medium text-[13px]">No notifications yet</p>
                </div>`;
                return;
            }

            container.innerHTML = notificationCenterNotices.map(n => {
                const isUnread = !globalUserNoticeReads.has(n.id);
                return `
                    <div class="relative bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm border ${isUnread ? 'border-indigo-200 cursor-pointer hover:border-indigo-400' : 'border-slate-100 dark:border-white/5 opacity-70'} transition-colors" onclick="markNoticeAsRead('${n.id}')">
                        ${isUnread ? '<div class="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>' : ''}
                        <h4 class="font-bold text-[13px] text-slate-900 dark:text-dark-text pr-4 leading-tight">${n.title}</h4>
                        <p class="text-[11px] text-slate-500 dark:text-dark-textSecondary mt-1 line-clamp-2">${n.message}</p>
                        <p class="text-[9px] font-bold text-slate-400 dark:text-dark-textSecondary mt-2 uppercase tracking-wide">${new Date(n.created_at).toLocaleDateString()} &bull; ${new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                `;
            }).join('');
            if(typeof lucide !== 'undefined') lucide.createIcons();
        }

        window.markNoticeAsRead = async function(noticeId) {
            if (globalUserNoticeReads.has(noticeId)) return;
            
            globalUserNoticeReads.add(noticeId);
            updateNotificationBadge();
            renderNotificationCenter();

            try {
                const { error } = await _supabase.from('user_notice_reads').insert([{
                    user_id: window.authState.user.id,
                    notice_id: noticeId
                }]);
                if (error) {
                    if (error.code !== '23505') throw error; // Ignore duplicate key
                }
            } catch (e) {
                console.error("[NOTIFICATIONS] Mark as read error:", e);
                globalUserNoticeReads.delete(noticeId);
                updateNotificationBadge();
                renderNotificationCenter();
            }
        };

        window.markAllNoticesAsRead = async function() {
            if (!window.authState.user) return;
            const unreadNotices = notificationCenterNotices.filter(n => !globalUserNoticeReads.has(n.id));
            if (unreadNotices.length === 0) return;

            // Optimistic update
            unreadNotices.forEach(n => globalUserNoticeReads.add(n.id));
            updateNotificationBadge();
            renderNotificationCenter();

            try {
                const inserts = unreadNotices.map(n => ({
                    user_id: window.authState.user.id,
                    notice_id: n.id
                }));
                const { error } = await _supabase.from('user_notice_reads').insert(inserts);
                if (error && error.code !== '23505') throw error;
            } catch (e) {
                console.error("[NOTIFICATIONS] Mark all as read error:", e);
                // Revert optimistic update
                unreadNotices.forEach(n => globalUserNoticeReads.delete(n.id));
                updateNotificationBadge();
                renderNotificationCenter();
            }
        };


window.NotificationService = {
    requestPermission: typeof requestNotificationPermission !== 'undefined' ? requestNotificationPermission : window.requestNotificationPermission,
    silentInit: typeof silentNotificationInit !== 'undefined' ? silentNotificationInit : window.silentNotificationInit,
    grantPermission: typeof grantNotificationPermission !== 'undefined' ? grantNotificationPermission : window.grantNotificationPermission,
    skipPermission: typeof skipNotificationPermission !== 'undefined' ? skipNotificationPermission : window.skipNotificationPermission,
    fetchNotices: typeof fetchNotificationCenterNotices !== 'undefined' ? fetchNotificationCenterNotices : window.fetchNotificationCenterNotices,
    openCenter: typeof openNotificationCenter !== 'undefined' ? openNotificationCenter : window.openNotificationCenter,
    closeCenter: typeof closeNotificationCenter !== 'undefined' ? closeNotificationCenter : window.closeNotificationCenter,
    markAsRead: typeof markNoticeAsRead !== 'undefined' ? markNoticeAsRead : window.markNoticeAsRead,
    markAllAsRead: typeof markAllNoticesAsRead !== 'undefined' ? markAllNoticesAsRead : window.markAllNoticesAsRead
};
console.log("[ARCHITECTURE]\nnotifications loaded");
