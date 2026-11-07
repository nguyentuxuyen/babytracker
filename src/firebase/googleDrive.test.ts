vi.mock('./config', () => ({ auth: {} }));
import { driveFailure } from './googleDrive';

const body = (reason: string, message = '') => JSON.stringify({ error: { code: 403, message, errors: [{ reason }] } });

describe('driveFailure', () => {
    it('recognises the Drive API not being enabled', () => {
        expect(driveFailure('folder', 403, body('accessNotConfigured', 'Google Drive API has not been used in project 224393169874')).code).toBe('api-disabled');
    });

    it('treats a missing scope as not connected', () => {
        expect(driveFailure('upload', 403, body('insufficientPermissions')).code).toBe('not-connected');
    });

    it('keeps the status and reason for anything else', () => {
        const error = driveFailure('upload', 500, body('backendError'));
        expect(error.code).toBe('failed');
        expect(error.message).toBe('upload 500 backendError');
        expect(driveFailure('folder', 404, 'not json').message).toBe('folder 404');
    });
});
