import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Moment } from '../../firebase/moments';
import DrivePhoto from './DrivePhoto';
import { formatMomentDate } from './MomentViewer';

export const MOMENT_ACCENT = '#ec4899';

interface Props {
    moment: Moment;
    onClick: () => void;
    showDate?: boolean;
}

// One moment as a tappable row: cover photo (with count), title, date and the start of the note.
const MomentCard: React.FC<Props> = ({ moment, onClick, showDate = true }) => {
    const { t } = useTranslation();
    const cover = moment.photos[0];
    return (
        <Box
            component="button"
            type="button"
            onClick={onClick}
            sx={{
                display: 'flex',
                gap: 1.5,
                alignItems: 'center',
                width: '100%',
                p: 1.25,
                textAlign: 'left',
                fontFamily: 'inherit',
                cursor: 'pointer',
                bgcolor: '#fff',
                border: '1px solid #fbcfe8',
                borderLeft: `4px solid ${MOMENT_ACCENT}`,
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(15,23,42,0.06)'
            }}
        >
            <Box sx={{
                position: 'relative',
                flex: '0 0 auto',
                width: 64,
                height: 64,
                borderRadius: '12px',
                overflow: 'hidden',
                bgcolor: '#fdf2f8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28
            }}>
                {cover
                    ? <DrivePhoto photo={cover} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <span aria-hidden>✨</span>}
                {moment.photos.length > 1 && (
                    <Box sx={{ position: 'absolute', right: 4, bottom: 4, px: 0.75, borderRadius: '8px', bgcolor: 'rgba(15,23,42,0.65)', color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '18px' }}>
                        {moment.photos.length}
                    </Box>
                )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: MOMENT_ACCENT, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {t('moments.label')}{showDate ? ` · ${formatMomentDate(moment.date)}` : ''}
                </Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#101c22' }} noWrap>
                    {moment.title || t('moments.untitled')}
                </Typography>
                {moment.location?.name && (
                    <Typography sx={{ fontSize: 13, color: '#be185d' }} noWrap>📍 {moment.location.name}</Typography>
                )}
                {moment.note && (
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a' }} noWrap>{moment.note}</Typography>
                )}
            </Box>
        </Box>
    );
};

export default MomentCard;
