import React, { useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMoments } from '../hooks/useMoments';
import { MAX_PHOTOS_PER_MOMENT, groupMomentsByMonth, mergedPhotoCount } from '../firebase/moments';
import { localeTag } from '../i18n';
import MomentCard from '../components/common/MomentCard';
import { useMomentSheets } from '../components/common/MomentSheets';
import PageHeader from '../components/common/PageHeader';
import MomentMergeDialog from '../components/common/MomentMergeDialog';
import { AddIcon, MomentsIcon } from '../components/common/icons';

// "Kỷ niệm": every moment, newest first, grouped by month.
const MomentsPage: React.FC = () => {
    const { t } = useTranslation();
    const history = useHistory();
    const { user } = useAuth();
    const { moments, loading } = useMoments(user?.uid);
    const { openMoment, addMoment, importPhotos, sheets } = useMomentSheets(user?.uid, moments);
    const photoCount = moments.reduce((sum, moment) => sum + moment.photos.length, 0);
    // "Gộp": pick several moments (e.g. the days of one trip) and merge them into one.
    const [picking, setPicking] = useState(false);
    const [pickedIds, setPickedIds] = useState<string[]>([]);
    const [merging, setMerging] = useState(false);
    const picked = moments.filter((moment) => pickedIds.includes(moment.id));
    const pickedPhotos = mergedPhotoCount(picked);
    const togglePicked = (id: string) => setPickedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
    const stopPicking = () => {
        setPicking(false);
        setPickedIds([]);
    };

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
                    action={picking ? (
                        <Button onClick={stopPicking} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#475569', bgcolor: '#f1f5f9' }}>
                            {t('common.cancel')}
                        </Button>
                    ) : moments.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.75 }}>
                            {moments.length > 1 && (
                                <Button
                                    onClick={() => setPicking(true)}
                                    aria-label={t('moments.merge.start')}
                                    title={t('moments.merge.start')}
                                    sx={{ minWidth: 0, height: 36, px: 1.25, borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: 13, color: '#be185d', bgcolor: '#fdf2f8' }}
                                >
                                    {t('moments.merge.startShort')}
                                </Button>
                            )}
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
                {picking && (
                    <Typography sx={{ fontSize: 13, color: '#be185d', mb: 1.5 }}>{t('moments.merge.pickHint')}</Typography>
                )}
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
                                <MomentCard
                                    key={moment.id}
                                    moment={moment}
                                    selected={picking ? pickedIds.includes(moment.id) : undefined}
                                    onClick={() => (picking ? togglePicked(moment.id) : openMoment(moment))}
                                />
                            ))}
                        </Box>
                    </Box>
                ))}
            </Box>
            {picking && (
                <Box sx={{
                    position: 'fixed', left: 0, right: 0, zIndex: 1100, bottom: 'calc(72px + env(safe-area-inset-bottom))',
                    display: 'flex', justifyContent: 'center', px: 2, pointerEvents: 'none'
                }}>
                    <Button
                        variant="contained"
                        disabled={picked.length < 2}
                        onClick={() => setMerging(true)}
                        sx={{
                            pointerEvents: 'auto', width: '100%', maxWidth: 528, py: 1.25, borderRadius: '14px', textTransform: 'none', fontWeight: 700,
                            bgcolor: '#ec4899', '&:hover': { bgcolor: '#db2777' }, boxShadow: '0 6px 18px rgba(236,72,153,0.35)'
                        }}
                    >
                        {picked.length < 2
                            ? t('moments.merge.pickMore')
                            : t('moments.merge.next', { count: picked.length, photos: pickedPhotos, max: MAX_PHOTOS_PER_MOMENT })}
                    </Button>
                </Box>
            )}
            {picking && <Box sx={{ height: 72 }} />}
            {user?.uid && (
                <MomentMergeDialog
                    open={merging}
                    onClose={() => setMerging(false)}
                    uid={user.uid}
                    moments={picked}
                    onMerged={(merged) => {
                        setMerging(false);
                        stopPicking();
                        openMoment(merged);
                    }}
                />
            )}
            {sheets}
        </Box>
    );
};

export default MomentsPage;
