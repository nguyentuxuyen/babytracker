import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMoments } from '../hooks/useMoments';
import { groupMomentsByMonth } from '../firebase/moments';
import { localeTag } from '../i18n';
import MomentCard from '../components/common/MomentCard';
import { useMomentSheets } from '../components/common/MomentSheets';
import PageHeader from '../components/common/PageHeader';
import { AddIcon, MomentsIcon } from '../components/common/icons';

// "Kỷ niệm": every moment, newest first, grouped by month.
const MomentsPage: React.FC = () => {
    const { t } = useTranslation();
    const history = useHistory();
    const { user } = useAuth();
    const { moments, loading } = useMoments(user?.uid);
    const { openMoment, addMoment, importPhotos, sheets } = useMomentSheets(user?.uid, moments);
    const photoCount = moments.reduce((sum, moment) => sum + moment.photos.length, 0);

    const monthLabel = (month: string) => {
        const [year, monthIndex] = month.split('-').map(Number);
        return new Date(year, monthIndex - 1, 1).toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f8' }}>
            <Box sx={{ px: 2, pt: 2 }}>
                <PageHeader
                    title={t('moments.pageTitle')}
                    subtitle={t('moments.summary', { count: moments.length, photos: photoCount })}
                    action={moments.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                            <Button
                                onClick={() => history.push('/moments/map')}
                                aria-label={t('moments.map.open')}
                                sx={{ minWidth: 0, width: 36, height: 36, p: 0, borderRadius: '12px', fontSize: 18, bgcolor: '#fdf2f8' }}
                            >
                                🗺️
                            </Button>
                            <Button
                                onClick={importPhotos}
                                aria-label={t('moments.import.button')}
                                title={t('moments.import.button')}
                                sx={{ minWidth: 0, width: 36, height: 36, p: 0, borderRadius: '12px', color: '#0369a1', bgcolor: '#f0f9ff' }}
                            >
                                <MomentsIcon sx={{ fontSize: 20 }} />
                            </Button>
                            <Button
                                onClick={() => addMoment()}
                                variant="contained"
                                aria-label={t('moments.addShort')}
                                sx={{ minWidth: 0, width: 36, height: 36, p: 0, borderRadius: '12px', bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' }, boxShadow: 'none' }}
                            >
                                <AddIcon sx={{ fontSize: 20 }} />
                            </Button>
                        </Box>
                    ) : undefined}
                />
                {loading && <CircularProgress size={28} sx={{ color: '#13a4ec' }} />}
                {!loading && moments.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                        <Typography sx={{ fontSize: 40, lineHeight: 1.2, mb: 1 }} aria-hidden>📸</Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#101c22', mt: 1 }}>{t('moments.emptyTitle')}</Typography>
                        <Typography sx={{ fontSize: 14, color: '#5b6b75', mt: 0.5, mb: 2 }}>{t('moments.emptyHint')}</Typography>
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Button onClick={() => addMoment()} variant="contained" sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec' }}>
                                {t('moments.addTitle')}
                            </Button>
                            <Button onClick={importPhotos} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#0369a1', bgcolor: '#f0f9ff' }}>
                                {t('moments.import.button')}
                            </Button>
                        </Box>
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
