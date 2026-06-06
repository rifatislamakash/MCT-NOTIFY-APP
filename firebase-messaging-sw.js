// 1. Import the Firebase Compat scripts
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const CACHE_NAME = 'mct-notify-v3';

self.addEventListener('install', (event) => {
    console.log('[PWA CACHE] Service worker installing, skipping waiting');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[PWA CACHE] Service worker activated, claiming clients');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[PWA CACHE] Old caches cleared:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 2. Initialize the Firebase app in the service worker
const firebaseConfig = {
    apiKey: "AIzaSyDBZj8DiQjd7KQyElLQ2ZC7IINJLPvebQU",
    authDomain: "notify---cms.firebaseapp.com",
    projectId: "notify---cms",
    storageBucket: "notify---cms.firebasestorage.app",
    messagingSenderId: "752160385235",
    appId: "1:752160385235:web:fefc78032ac6c2906acc26"
};

firebase.initializeApp(firebaseConfig);

// 3. Retrieve an instance of Firebase Messaging so it can handle background messages
const messaging = firebase.messaging();

// 4. Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[FIREBASE BACKGROUND] Received background message: ', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || "MCT Notify";
    const body = payload.notification?.body || payload.data?.body || "You have a new update.";
    const icon = payload.notification?.icon || payload.data?.icon || 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Logo.png';
    const badge = payload.notification?.badge || payload.data?.badge || 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Logo.png';

    const notificationOptions = {
        body: body,
        icon: icon,
        badge: badge,
        data: payload
    };

    if (navigator.setAppBadge && (payload.notification?.badge || payload.data?.badge)) {
        const badgeCount = parseInt(payload.notification?.badge || payload.data?.badge || 1);
        navigator.setAppBadge(badgeCount).catch(err => console.warn('[FIREBASE BACKGROUND] Set badge failed:', err));
    }

    // Prevent background notification duplication:
    // If standard notification title and body are already present, the platform automatically displays the alert banner.
    if (payload.notification && payload.notification.title && payload.notification.body) {
        console.log('[FIREBASE BACKGROUND] Standard notification title and body present. Suppressing secondary manual registration call to prevent duplication.');
        return;
    }

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 5. Handle notification click actions
self.addEventListener('notificationclick', (event) => {
    console.log('[FIREBASE BACKGROUND] Notification clicked:', event.notification);
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window open
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
