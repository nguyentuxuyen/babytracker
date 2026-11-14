import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { vi } from 'vitest';
import '../../i18n';
import i18n from '../../i18n';

vi.mock('../../hooks/useDriveStatus', () => ({ useDriveStatus: () => ({ status: { configured: true, connected: true, folderId: 'f' } }) }));
vi.mock('../../firebase/googleDrive', () => ({ connectDrive: vi.fn() }));
vi.mock('../../firebase/moments', async (importOriginal) => ({ ...(await importOriginal<object>()), saveMoment: vi.fn() }));
vi.mock('../../utils/photoExif', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    readPhotoMeta: vi.fn(async () => ({ gps: null, takenAt: null }))
}));
vi.mock('../../services/geocode', () => ({ reverseGeocode: vi.fn(async () => '') }));

// eslint-disable-next-line import/first
import MomentEditorDialog from './MomentEditorDialog';

const photos = (count: number) => Array.from({ length: count }, (_, i) => new File(['x'], `IMG_${i}.jpg`, { type: 'image/jpeg' }));

const pick = async (files: File[]) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
};

const previewCount = () => document.querySelectorAll('img[src^="blob:"]').length;

let container: HTMLDivElement;

beforeAll(() => {
    if (!URL.createObjectURL) (URL as any).createObjectURL = () => '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${Math.random()}`);
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => undefined;
});

beforeEach(async () => {
    await i18n.changeLanguage('vi');
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.render(<MomentEditorDialog open uid="u1" onClose={() => undefined} />, container);
    });
});

afterEach(() => {
    act(() => {
        ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
});

describe('MomentEditorDialog photo picking', () => {
    it('keeps more than 10 photos from one pick', async () => {
        await pick(photos(15));
        expect(previewCount()).toBe(15);
        expect(document.body.textContent).not.toContain('tối đa');
    });

    it('fills a moment up to 30 photos and says so when more were picked', async () => {
        await pick(photos(35));
        expect(previewCount()).toBe(30);
        expect(document.body.textContent).toContain('Mỗi khoảnh khắc tối đa 30 ảnh');
    });

    it('adds a second pick up to the 30 photo limit', async () => {
        await pick(photos(20));
        await pick(photos(20));
        expect(previewCount()).toBe(30);
    });
});
