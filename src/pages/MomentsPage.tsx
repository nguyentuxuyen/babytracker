import React from 'react';
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useMoments } from '../hooks/useMoments';
import { groupMomentsByMonth } from '../firebase/moments';
import { localeTag } from '../i18n';
import MomentCard from '../components/common/MomentCard';
import { useMomentSheets } from '../components/common/MomentSheets';

// "Kỷ niệm": every moment, newest first, grouped by month.
const MomentsPage: React.FC = () => {
    const history = useHistory();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { moments, loading } = useMoments(user?.uid);
    const { openMoment, addMoment, sheets } = useMomentSheets(user?.uid, moments);
    const photoCount = moments.reduce((sum, moment) => sum + moment.photos.length, 0);

    const monthLabel = (month: string) => {
        const [year, monthIndex] = month.split('-').map(Number);
        return new Date(year, monthIndex - 1, 1).toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f8' }}>
            <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1 }}>
                <IconButton onClick={() => history.push('/')} aria-label={t('common.back')} sx={{ color: '#13a4ec' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </IconButton>
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#101c22' }}>{t('moments.pageTitle')}</Typography>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>
                        {t('moments.summary', { count: moments.length, photos: photoCount })}
                    </Typography>
                </Box>
                <Button
                    onClick={() => addMoment()}
                    variant="contained"
                    sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' }, mr: 1 }}
                >
                    + {t('moments.addShort')}
                </Button>
            </Box>

            <Box sx={{ px: 2, pt: 2 }}>
                {loading && <CircularProgress size={28} sx={{ color: '#13a4ec' }} />}
                {!loading && moments.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                        <Typography sx={{ fontSize: 40 }} aria-hidden>📸</Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#101c22', mt: 1 }}>{t('moments.emptyTitle')}</Typography>
                        <Typography sx={{ fontSize: 14, color: '#6b7f8a', mt: 0.5, mb: 2 }}>{t('moments.emptyHint')}</Typography>
                        <Button onClick={() => addMoment()} variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec' }}>
                            {t('moments.addTitle')}
                        </Button>
                    </Box>
                )}
                {groupMomentsByMonth(moments).map(([month, items]) => (
                    <Box key={month} sx={{ mb: 3 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#475569', mb: 1, textTransform: 'capitalize' }}>
                            {monthLabel(month)}
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {items.map((moment) => (
                                <MomentCard key={moment.id} moment={moment} onClick={() => openMoment(moment)} />
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>
            {sheets}
        </Box>
    );
};

export default MomentsPage;
