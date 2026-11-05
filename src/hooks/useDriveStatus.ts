import { useCallback, useEffect, useState } from 'react';
import { DriveStatus, getDriveStatus, onDriveStatus } from '../firebase/googleDrive';

// Google Drive connection for moment photos. `status` stays null while loading or when
// the server cannot be reached (offline), so callers do not block on it.
export const useDriveStatus = (enabled = true) => {
    const [status, setStatus] = useState<DriveStatus | null>(null);
    const [loading, setLoading] = useState(enabled);

    const refresh = useCallback((force = false) => {
        setLoading(true);
        return getDriveStatus(force)
            .then((next) => { setStatus(next); return next; })
            .catch(() => null)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;
        void refresh();
        return onDriveStatus(setStatus);
    }, [enabled, refresh]);

    return { status, loading, refresh };
};
