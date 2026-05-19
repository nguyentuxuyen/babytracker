import { User } from 'firebase/auth';

const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

const getAuthHeaders = async (user: User) => {
    const token = await user.getIdToken();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
};

export const isPushSupported = () => {
    return typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        typeof Notification !== 'undefined';
};

export const subscribeUserToPush = async (user: User, intervalMinutes: number) => {
    if (!isPushSupported()) {
        throw new Error('Push is not supported on this browser');
    }

    const publicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
    if (!publicKey) {
        throw new Error('Missing REACT_APP_VAPID_PUBLIC_KEY');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
    }

    const headers = await getAuthHeaders(user);
    const response = await fetch('/api/pushSubscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            subscription: subscription.toJSON(),
            enabled: true,
            intervalMinutes
        })
    });

    if (!response.ok) {
        throw new Error('Failed to register push subscription');
    }

    return subscription;
};

export const unsubscribeUserFromPush = async (user: User) => {
    if (!isPushSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const headers = await getAuthHeaders(user);
    await fetch('/api/pushUnsubscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            endpoint: subscription.endpoint
        })
    });

    await subscription.unsubscribe();
};

export const sendTestPushNotification = async (user: User) => {
    const headers = await getAuthHeaders(user);
    const response = await fetch('/api/pushSendTest', {
        method: 'POST',
        headers
    });
    if (!response.ok) {
        throw new Error('Failed to send test push');
    }
};
