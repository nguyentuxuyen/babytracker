import { useEffect, useState } from 'react';

// Chrome/Edge/Samsung Internet fire `beforeinstallprompt` once the app is installable.
// It can fire before React mounts, so we listen from module load (imported in index.tsx)
// and keep the event until the user taps our own "Install" button.
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'android' | 'ios' | 'other';

export interface PwaInstallState {
    canPrompt: boolean;
    installed: boolean;
    platform: InstallPlatform;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function detectPlatform(userAgent: string): InstallPlatform {
    if (/android/i.test(userAgent)) return 'android';
    // iPadOS 13+ reports itself as Macintosh; touch support tells it apart.
    if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
    if (/macintosh/i.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios';
    return 'other';
}

export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return Boolean(
        nav.standalone ||
        window.matchMedia?.('(display-mode: standalone)').matches ||
        window.matchMedia?.('(display-mode: minimal-ui)').matches
    );
}

export function getInstallState(): PwaInstallState {
    return {
        canPrompt: Boolean(deferredPrompt),
        installed: installedNow || isStandalone(),
        platform: typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent)
    };
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt;
    if (!event) return 'unavailable';
    // The event can only be used once.
    deferredPrompt = null;
    notify();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
        installedNow = true;
        notify();
    }
    return outcome;
}

export function initPwaInstall(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (event) => {
        // Keep Chrome's mini-infobar from showing; our button shows the prompt instead.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installedNow = true;
        notify();
    });
}

export function usePwaInstall(): PwaInstallState {
    const [state, setState] = useState(getInstallState);
    useEffect(() => {
        const update = () => setState(getInstallState());
        listeners.add(update);
        update();
        return () => {
            listeners.delete(update);
        };
    }, []);
    return state;
}

// Test helpers.
export function __setDeferredPromptForTest(event: unknown): void {
    deferredPrompt = event as BeforeInstallPromptEvent | null;
    installedNow = false;
    notify();
}
