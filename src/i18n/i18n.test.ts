import ja from './locales/ja.json';
import en from './locales/en.json';
import vi from './locales/vi.json';
import i18n, { changeLanguage, localeTag } from './index';
import { formatHoursMinutes } from './format';

// Flatten nested keys and drop plural suffixes so "a_one"/"a_other" and "a" compare equal.
const keysOf = (value: unknown, prefix = ''): string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
    return Object.entries(value as Record<string, unknown>)
        .flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
};
const baseKeys = (resource: unknown) =>
    Array.from(new Set(keysOf(resource).map((key) => key.replace(/_(one|other)$/, '')))).sort();

describe('i18n resources', () => {
    it('defines the same keys in every language', () => {
        expect(baseKeys(en)).toEqual(baseKeys(ja));
        expect(baseKeys(vi)).toEqual(baseKeys(ja));
    });

    it('defaults to Japanese and switches language', async () => {
        expect(i18n.language).toBe('ja');
        expect(i18n.t('nav.home')).toBe('ホーム');

        await changeLanguage('en');
        expect(i18n.t('nav.home')).toBe('Home');
        expect(i18n.t('relative.daysAgo', { count: 1 })).toBe('1 day ago');
        expect(i18n.t('relative.daysAgo', { count: 3 })).toBe('3 days ago');
        expect(localeTag()).toBe('en-US');
        expect(localStorage.getItem('babytracker.language')).toBe('en');

        await changeLanguage('vi');
        expect(i18n.t('nav.home')).toBe('Trang chủ');
        expect(formatHoursMinutes(2, 30)).toBe('2 giờ 30 phút');

        await changeLanguage('ja');
        expect(formatHoursMinutes(2, 0)).toBe('2時間');
        expect(formatHoursMinutes(0, 45)).toBe('45分');
    });
});
