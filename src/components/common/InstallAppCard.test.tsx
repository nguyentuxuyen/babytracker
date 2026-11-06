import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import '../../i18n';
import InstallAppCard from './InstallAppCard';
import { __setDeferredPromptForTest, detectPlatform } from '../../utils/pwaInstall';

let container: HTMLDivElement;
const originalUA = navigator.userAgent;
const setUA = (value: string) => Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

const render = (variant: 'banner' | 'section') => act(() => {
    ReactDOM.render(<InstallAppCard variant={variant} />, container);
});

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    __setDeferredPromptForTest(null);
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    setUA(originalUA);
});

describe('detectPlatform', () => {
    it('tells Android, iOS and others apart', () => {
        expect(detectPlatform(ANDROID)).toBe('android');
        expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
        expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
    });
});

describe('InstallAppCard', () => {
    it('shows the install button when the browser offers a prompt and runs it', async () => {
        setUA(ANDROID);
        const prompt = vi.fn().mockResolvedValue(undefined);
        __setDeferredPromptForTest({ prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
        render('banner');
        const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Cài ứng dụng');
        expect(button).toBeTruthy();
        await act(async () => {
            button!.click();
        });
        expect(prompt).toHaveBeenCalledTimes(1);
        // Installed: the banner goes away.
        expect(container.textContent).toBe('');
    });

    it('falls back to Chrome menu steps on Android without a prompt', () => {
        setUA(ANDROID);
        render('banner');
        expect(container.textContent).toContain('Cài đặt ứng dụng');
        expect(container.querySelector('button[aria-label="Ẩn"]')).toBeTruthy();
    });

    it('hides the banner once dismissed, but keeps the Settings section', () => {
        setUA(ANDROID);
        render('banner');
        act(() => {
            (container.querySelector('button[aria-label="Ẩn"]') as HTMLButtonElement).click();
        });
        expect(container.textContent).toBe('');
        expect(localStorage.getItem('babytracker.installBannerDismissed')).toBe('1');
        render('section');
        expect(container.textContent).toContain('Cài đặt ứng dụng');
    });

    it('does not show a banner on desktop without a prompt', () => {
        setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        render('banner');
        expect(container.textContent).toBe('');
    });
});
