// Firebase Compat SDK
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const CACHE_NAME = 'mct-notify-v4';

// ======================
// SERVICE WORKER INSTALL
// ======================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

// ======================
// SERVICE WORKER ACTIVATE
// ======================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activated');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ======================
// FIREBASE CONFIG
// ======================

const firebaseConfig = {
    apiKey: "AIzaSyDBZj8DiQjd7KQyElLQ2ZC7IINJLPvebQU",
    authDomain: "notify---cms.firebaseapp.com",
    projectId: "notify---cms",
    storageBucket: "notify---cms.firebasestorage.app",
    messagingSenderId: "752160385235",
    appId: "1:752160385235:web:fefc78032ac6c2906acc26"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// ======================
// BACKGROUND NOTIFICATION
// ======================

messaging.onBackgroundMessage(async (payload) => {

    console.log('[FCM BACKGROUND]', payload);

    // SECURITY TRACE: Fetch student credentials from Cache Storage
    let accessGranted = true;
    const target_type = payload?.data?.target_type;
    const target_id = payload?.data?.target_id;

    if (target_type) {
        accessGranted = false; // Default strictly deny if target data is present
        try {
            const cache = await caches.open('mct-profile-rules');
            const res = await cache.match('/rules.json');
            if (res) {
                const rules = await res.json();
                
                console.log('[SW SECURITY TRACE]', {
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
                console.warn('[SW SECURITY TRACE] Cache rules missing. Access strictly denied by default.');
            }
        } catch (e) {
            console.warn('[SW SECURITY TRACE] Evaluation error:', e);
        }
    }

    if (!accessGranted) {
        console.log('[SW SECURITY TRACE] Access Denied. Payload dropped.');
        return;
    }

    const notificationTitle =
        payload?.data?.title ||
        payload?.notification?.title ||
        "MCT Notify";

    let notificationBody =
        payload?.data?.body ||
        payload?.notification?.body ||
        "You have a new update.";
        
    if (notificationBody.length > 150) {
        notificationBody = notificationBody.substring(0, 150) + '......';
    }

    const icon =
        payload?.data?.icon ||
        payload?.notification?.icon ||
        "/assets/Logo.png";

    const badge =
        payload?.data?.badge ||
        payload?.notification?.badge ||
        "/assets/badge.png";

    const image =
        payload?.data?.image ||
        payload?.notification?.image; // Removed fallback logo image to prevent big image popup

    const clickAction =
        payload?.data?.click_action ||
        "https://mctnotify.vercel.app";

    const notificationOptions = {
        body: notificationBody,
        icon: icon,
        badge: badge,
        // image payload completely removed to ensure no large popup images ever show natively
        requireInteraction: true,
        tag: 'mct-notify',

        data: {
            click_action: clickAction
        }
    };

    return self.registration.showNotification(
        notificationTitle,
        notificationOptions
    );
});

// ======================
// NOTIFICATION CLICK
// ======================

self.addEventListener('notificationclick', (event) => {

    console.log('[FCM CLICK]', event.notification);

    event.notification.close();

    const targetUrl =
        event.notification?.data?.click_action ||
        'https://mctnotify.vercel.app';

    event.waitUntil(

        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {

            for (const client of clientList) {

                if (
                    client.url.includes('mctnotify.vercel.app') &&
                    'focus' in client
                ) {
                    return client.focus();
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
