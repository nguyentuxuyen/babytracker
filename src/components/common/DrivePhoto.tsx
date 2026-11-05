import React, { useEffect, useState } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import { cachedPhotoUrl, loadDrivePhoto } from '../../firebase/googleDrive';
import { MomentPhoto } from '../../firebase/moments';

interface Props {
    photo: MomentPhoto;
    alt?: string;
    sx?: SxProps<Theme>;
}

// A moment photo stored in Google Drive: downloaded with the user's token (then cached),
// with a soft placeholder while it loads and a broken-photo mark if it cannot be read.
const DrivePhoto: React.FC<Props> = ({ photo, alt = '', sx }) => {
    const [src, setSrc] = useState<string | null>(() => cachedPhotoUrl(photo.driveFileId));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;
        setFailed(false);
        setSrc(cachedPhotoUrl(photo.driveFileId));
        loadDrivePhoto(photo.driveFileId)
            .then((url) => { if (active) setSrc(url); })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [photo.driveFileId]);

    if (!src) {
        return (
            <Box
                role="img"
                aria-label={alt || undefined}
                aria-busy={!failed}
                sx={[
                    {
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: '#e2e8f0',
                        color: '#94a3b8',
                        fontSize: 22,
                        ...(failed ? {} : {
                            animation: 'drivePhotoPulse 1.2s ease-in-out infinite',
                            '@keyframes drivePhotoPulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.55 } }
                        })
                    },
                    ...(Array.isArray(sx) ? sx : [sx])
                ]}
            >
                {failed ? '🖼' : null}
            </Box>
        );
    }
    return <Box component="img" src={src} alt={alt} sx={sx} />;
};

export default DrivePhoto;
