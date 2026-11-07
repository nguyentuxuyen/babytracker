vi.mock('../i18n', () => ({ currentLanguage: () => 'vi' }));
import { reverseGeocode, searchPlaces, shortPlaceName } from './geocode';

afterEach(() => vi.unstubAllGlobals());

describe('geocode', () => {
    it('keeps the place and its area, not the whole address', () => {
        expect(shortPlaceName({ lat: '1', lon: '2', name: 'Công viên Ueno', address: { suburb: 'Taito', city: 'Tokyo' } })).toBe('Công viên Ueno, Taito');
        expect(shortPlaceName({ lat: '1', lon: '2', name: '', address: { road: 'Chuo-dori', city: 'Tokyo' } })).toBe('Chuo-dori, Tokyo');
        expect(shortPlaceName({ lat: '1', lon: '2', display_name: 'A, B, C' })).toBe('A');
    });

    it('searches and asks in the app language', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [{ lat: '35.7', lon: '139.7', name: 'Ueno', address: { city: 'Tokyo' } }, { lat: 'x', lon: '1' }] }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await searchPlaces('ueno')).toEqual([{ lat: 35.7, lng: 139.7, name: 'Ueno, Tokyo' }]);
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('accept-language=vi');
    });

    it('gives null when reverse lookup fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await reverseGeocode(1, 2)).toBeNull();
    });
});
