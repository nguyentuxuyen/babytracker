import i18n, { changeLanguage } from './index';
import { applyTranslationOverrides, cleanOverrides } from './overrides';

jest.mock('../firebase/config', () => ({ db: {} }));

describe('translation overrides', () => {
    it('replaces bundled text and restores it when removed', async () => {
        await changeLanguage('vi');
        applyTranslationOverrides({ vi: { 'nav.home': 'Nhà' } });
        expect(i18n.t('nav.home')).toBe('Nhà');

        applyTranslationOverrides({});
        expect(i18n.t('nav.home')).toBe('Trang chủ');
    });

    it('drops unknown keys, empty text and text equal to the bundled one', () => {
        expect(cleanOverrides({
            vi: { 'nav.home': 'Trang chủ', 'nav.stats': ' ', 'no.such.key': 'x', 'nav.food': 'Ăn' }
        })).toEqual({ vi: { 'nav.food': 'Ăn' } });
    });
});
