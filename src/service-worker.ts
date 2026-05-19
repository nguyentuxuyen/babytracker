/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
self.skipWaiting();

precacheAndRoute(self.__WB_MANIFEST);

const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
    new NavigationRoute(createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`), {
        denylist: [/^\/_/, /\/[^/?]+\.[^/]+$/]
    })
);

registerRoute(
    ({ request }) =>
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'worker',
    new StaleWhileRevalidate({
        cacheName: 'static-resources-v1'
    })
);

registerRoute(
    ({ request }) => request.destination === 'image',
    new StaleWhileRevalidate({
        cacheName: 'images-v1',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60
            })
        ]
    })
);

registerRoute(
    ({ request, url }) =>
        request.method === 'GET' &&
        !url.hostname.includes('firebaseio.com') &&
        !url.hostname.includes('firestore.googleapis.com') &&
        (
            url.origin.includes('googleapis.com') ||
            url.origin.includes('gstatic.com') ||
            fileExtensionRegexp.test(url.pathname)
        ),
    new NetworkFirst({
        cacheName: 'network-first-v1',
        networkTimeoutSeconds: 5,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 7 * 24 * 60 * 60
            })
        ]
    })
);

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('push', (event) => {
    const defaultPayload = {
        title: 'Baby Tracker',
        body: 'Bạn có một nhắc nhở mới 👶',
        url: '/activities'
    };

    let payload = defaultPayload;
    if (event.data) {
        try {
            payload = { ...defaultPayload, ...event.data.json() };
        } catch (error) {
            payload = { ...defaultPayload, body: event.data.text() || defaultPayload.body };
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: `${process.env.PUBLIC_URL}/icon-192.svg`,
            badge: `${process.env.PUBLIC_URL}/icon-192.svg`,
            data: { url: payload.url || '/activities' }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/activities';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
            return undefined;
        })
    );
});
