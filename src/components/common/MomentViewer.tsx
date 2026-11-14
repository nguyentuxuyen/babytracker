import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../i18n';
import { Moment, deleteMoment, momentPlaces, saveLegModes } from '../../firebase/moments';
import { samePlace } from '../../utils/geo';
import { journeyStops } from '../../utils/journey';

// Leaflet is only loaded when a journey is played.
const MomentJourneyDialog = React.lazy(() => import('./MomentJourneyDialog'));
import { SlideUp, bottomSheetProps } from './MomentEditorDialog';
import DrivePhoto from './DrivePhoto';
import { mapsUrl } from '../../services/geocode';

const SWIPE_THRESHOLD_PX = 50;

export const formatMomentDate = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(localeTag(), options);
};

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    moment: Moment | null;
    onEdit: (moment: Moment) => void;
    /** Photo to show first (from a map pin); the first photo otherwise. */
    initialPhotoId?: string | null;
}

const MomentViewer: React.FC<Props> = ({ open, onClose, uid, moment, onEdit, initialPhotoId }) => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [journeyOpen, setJourneyOpen] = useState(false);
    const [error, setError] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const photos = moment?.photos || [];

    useEffect(() => {
        setIndex(Math.max(0, photos.findIndex((photo) => photo.id === initialPhotoId)));
        setConfirmDelete(false);
        setJourneyOpen(false);
        setError(false);
        // Only when another moment opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moment?.id, open, initialPhotoId]);

    useEffect(() => {
        setIndex((current) => Math.min(current, Math.max(0, photos.length - 1)));
    }, [photos.length]);

    // Kept stable between renders: the journey restarts whenever its stops change.
    const stops = useMemo(() => (moment ? journeyStops(moment) : []), [moment]);

    if (!moment) return null;
    const current = photos[index];
    const places = momentPlaces(moment);
    const journeyStopCount = stops.length;
    // With photos from several places, each photo shows where it was taken.
    const currentPlace = places.length > 1 && current?.place
        ? { ...current.place, name: current.place.name || places.find((place) => samePlace(place, current.place!))?.name || '' }
        : null;
    const go = (step: number) => {
        if (photos.length > 1) setIndex((value) => (value + step + photos.length) % photos.length);
    };

    const handleDelete = async () => {
        try {
            await deleteMoment(uid, moment);
            onClose();
        } catch {
            setError(true);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 2, pt: 2, pb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#101c22', lineHeight: 1.3 }}>
                        {moment.title || t('moments.untitled')}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>
                        {formatMomentDate(moment.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </Typography>
                    {places.length > 1 && (
                        <Typography sx={{ mt: 0.25, fontSize: 13, color: '#9d174d' }}>
                            📍 {places.map((place) => place.name).join(' · ')}
                        </Typography>
                    )}
                    {places.length <= 1 && moment.location && (
                        <Box
                            component="a"
                            href={mapsUrl(moment.location.lat, moment.location.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.25, fontSize: 13, fontWeight: 600, color: '#be185d', textDecoration: 'none' }}
                        >
                            <span aria-hidden>📍</span>
                            {moment.location.name || t('moments.location.onMap')}
                        </Box>
                    )}
                </Box>
                <IconButton onClick={onClose} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            <Box sx={{ overflowY: 'auto' }}>
                {current && (
                    <Box
                        sx={{ position: 'relative', bgcolor: '#0f172a', height: 'min(62vh, 100vw)', userSelect: 'none', touchAction: 'pan-y' }}
                        onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
                        onTouchEnd={(event) => {
                            if (touchStartX.current === null) return;
                            const delta = event.changedTouches[0].clientX - touchStartX.current;
                            touchStartX.current = null;
                            if (Math.abs(delta) > SWIPE_THRESHOLD_PX) go(delta < 0 ? 1 : -1);
                        }}
                    >
                        <DrivePhoto
                            key={current.id}
                            photo={current}
                            alt={t('moments.photoAlt', { index: index + 1 })}
                            sx={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                display: 'block',
                                animation: 'momentPhotoIn 0.25s ease-out',
                                '@keyframes momentPhotoIn': { from: { opacity: 0 }, to: { opacity: 1 } }
                            }}
                        />
                        {photos.length > 1 && (
                            <>
                                {[-1, 1].map((step) => (
                                    <IconButton
                                        key={step}
                                        onClick={() => go(step)}
                                        aria-label={step < 0 ? t('moments.previous') : t('moments.next')}
                                        sx={{
                                            position: 'absolute',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            [step < 0 ? 'left' : 'right']: 8,
                                            bgcolor: 'rgba(255,255,255,0.85)',
                                            '&:hover': { bgcolor: '#ffffff' }
                                        }}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                            <path d={step < 0 ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} stroke="#101c22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </IconButton>
                                ))}
                                <Box sx={{ position: 'absolute', top: 10, left: 10, px: 1.25, py: 0.25, borderRadius: '10px', bgcolor: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                                    {index + 1}/{photos.length}
                                </Box>
                            </>
                        )}
                        {currentPlace && (
                            <Box
                                component="a"
                                href={mapsUrl(currentPlace.lat, currentPlace.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    position: 'absolute', left: 10, bottom: 10, maxWidth: 'calc(100% - 20px)', px: 1.25, py: 0.5,
                                    borderRadius: '10px', bgcolor: 'rgba(15,23,42,0.65)', color: '#fff', fontSize: 12, fontWeight: 600,
                                    textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}
                            >
                                📍 {currentPlace.name || t('moments.location.onMap')}
                            </Box>
                        )}
                    </Box>
                )}

                {photos.length > 1 && (
                    <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1.5, overflowX: 'auto' }}>
                        {photos.map((photo, photoIndex) => (
                            <Box
                                key={photo.id}
                                component="button"
                                type="button"
                                onClick={() => setIndex(photoIndex)}
                                aria-label={t('moments.photoAlt', { index: photoIndex + 1 })}
                                sx={{
                                    flex: '0 0 auto',
                                    width: 52,
                                    height: 52,
                                    p: 0,
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: photoIndex === index ? '3px solid #13a4ec' : '3px solid transparent',
                                    bgcolor: '#f1f5f9'
                                }}
                            >
                                <DrivePhoto photo={photo} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </Box>
                        ))}
                    </Box>
                )}

                {journeyStopCount > 1 && (
                    <Box sx={{ px: 2, pt: 1.5 }}>
                        <Button
                            fullWidth
                            onClick={() => setJourneyOpen(true)}
                            sx={{ borderRadius: '14px', py: 1, textTransform: 'none', fontWeight: 700, color: '#be185d', bgcolor: '#fdf2f8', border: '1px solid #fbcfe8', '&:hover': { bgcolor: '#fce7f3' } }}
                        >
                            🚗 {t('moments.journey.play', { count: journeyStopCount })}
                        </Button>
                    </Box>
                )}

                {moment.note && (
                    <Typography sx={{ px: 2, pt: 2, fontSize: 15, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {moment.note}
                    </Typography>
                )}
            </Box>

            {error && <Alert severity="error" sx={{ mx: 2, mt: 1 }}>{t('moments.errors.failed')}</Alert>}

            <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <Button
                    onClick={() => (confirmDelete ? handleDelete() : setConfirmDelete(true))}
                    sx={{
                        flex: 1,
                        borderRadius: '14px',
                        py: 1.1,
                        textTransform: 'none',
                        fontWeight: 600,
                        color: confirmDelete ? '#fff' : '#dc2626',
                        bgcolor: confirmDelete ? '#dc2626' : '#fef2f2',
                        '&:hover': { bgcolor: confirmDelete ? '#b91c1c' : '#fee2e2' }
                    }}
                >
                    {confirmDelete ? t('moments.confirmDelete') : t('moments.delete')}
                </Button>
                <Button
                    variant="contained"
                    onClick={() => onEdit(moment)}
                    sx={{ flex: 1, borderRadius: '14px', py: 1.1, textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}
                >
                    {t('moments.edit')}
                </Button>
            </Box>
            {journeyOpen && (
                <React.Suspense fallback={null}>
                    <MomentJourneyDialog
                        open={journeyOpen}
                        onClose={() => setJourneyOpen(false)}
                        id={moment.id}
                        title={moment.title}
                        stops={stops}
                        legModes={moment.legModes || {}}
                        onSaveModes={(modes) => saveLegModes(uid, moment.id, modes)}
                    />
                </React.Suspense>
            )}
        </Dialog>
    );
};

export default MomentViewer;
