import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, ButtonBase, CircularProgress, Dialog, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../hooks/useAuth';
import { useMoments } from '../hooks/useMoments';
import { useMomentSheets } from '../components/common/MomentSheets';
import { SlideUp, bottomSheetProps } from '../components/common/MomentEditorDialog';
import { formatMomentDate } from '../components/common/MomentViewer';
import DrivePhoto from '../components/common/DrivePhoto';
import PageHeader from '../components/common/PageHeader';
import { cachedPhotoUrl, loadDrivePhoto } from '../firebase/googleDrive';
import { MapPin, momentPins } from '../utils/momentPins';

const PIN_SIZE = 52;

// The pin is a round photo with a count badge. Only a blob URL and numbers go into the
// HTML, never user text, so nothing typed in a moment can end up as markup.
const pinIcon = (photoUrl: string | null, count: number) => L.divIcon({
    className: 'bt-moment-pin',
    iconSize: [PIN_SIZE, PIN_SIZE + 8],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE + 8],
    html: `<div class="bt-pin-photo">${photoUrl ? `<img src="${photoUrl}" alt="">` : '<span>✨</span>'}</div>`
        + `<div class="bt-pin-tail"></div>${count > 1 ? `<div class="bt-pin-count">${count}</div>` : ''}`
});

const pinStyles = {
    '& .bt-moment-pin': { background: 'none', border: 'none' },
    '& .bt-pin-photo': {
        width: PIN_SIZE, height: PIN_SIZE, borderRadius: '50%', overflow: 'hidden', border: '3px solid #fff',
        boxShadow: '0 2px 8px rgba(15,23,42,0.35)', bgcolor: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
    },
    '& .bt-pin-photo img': { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    '& .bt-pin-tail': {
        width: 0, height: 0, margin: '-2px auto 0', borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '10px solid #fff'
    },
    '& .bt-pin-count': {
        position: 'absolute', top: -4, right: -6, minWidth: 22, height: 22, px: '5px', borderRadius: '11px', bgcolor: '#ec4899', color: '#fff',
        fontSize: 12, fontWeight: 700, lineHeight: '22px', textAlign: 'center', border: '2px solid #fff', boxSizing: 'border-box'
    }
} as const;

// "Bản đồ kỷ niệm": every moment photo pinned where it was taken (OpenStreetMap tiles).
const MomentsMapPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { moments, loading } = useMoments(user?.uid);
    const { openMoment, sheets } = useMomentSheets(user?.uid, moments);
    const pins = useMemo(() => momentPins(moments), [moments]);
    const [picked, setPicked] = useState<MapPin | null>(null);
    const mapDiv = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);
    const fitted = useRef(false);

    useEffect(() => {
        if (!mapDiv.current || map.current) return undefined;
        map.current = L.map(mapDiv.current, { zoomControl: false, attributionControl: true }).setView([35.68, 139.76], 5);
        L.control.zoom({ position: 'bottomright' }).addTo(map.current);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    useEffect(() => {
        if (!map.current || !layer.current) return undefined;
        let active = true;
        layer.current.clearLayers();
        pins.forEach((pin) => {
            const count = pin.photoCount;
            const cover = pin.cover;
            const marker = L.marker([pin.lat, pin.lng], {
                icon: pinIcon(cover ? cachedPhotoUrl(cover.driveFileId) : null, count),
                title: pin.name,
                keyboard: true
            }).addTo(layer.current!);
            marker.on('click', () => {
                if (pin.entries.length === 1) openMoment(pin.entries[0].moment, pin.entries[0].photos[0]?.id);
                else setPicked(pin);
            });
            if (cover && !cachedPhotoUrl(cover.driveFileId)) {
                loadDrivePhoto(cover.driveFileId)
                    .then((url) => { if (active) marker.setIcon(pinIcon(url, count)); })
                    .catch(() => undefined);
            }
        });
        if (pins.length && !fitted.current) {
            fitted.current = true;
            map.current.fitBounds(L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng] as [number, number])), { padding: [48, 48], maxZoom: 15 });
        }
        return () => { active = false; };
    }, [pins, openMoment]);

    const photoTotal = pins.reduce((sum, pin) => sum + pin.photoCount, 0);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f8' }}>
            <Box sx={{ px: 2, pt: 2 }}>
                <PageHeader
                    back
                    title={t('moments.map.title')}
                    subtitle={loading ? undefined : t('moments.map.summary', { places: pins.length, photos: photoTotal })}
                />
            </Box>
            <Box sx={{ position: 'relative', mx: 2, borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb', ...pinStyles }}>
                <Box ref={mapDiv} sx={{ height: 'calc(100vh - 210px - env(safe-area-inset-bottom))', minHeight: 320, bgcolor: '#e5e7eb' }} />
                {loading && (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
                        <CircularProgress size={28} sx={{ color: '#13a4ec' }} />
                    </Box>
                )}
                {!loading && !pins.length && (
                    <Box sx={{ position: 'absolute', left: 12, right: 12, top: 12, zIndex: 500, p: 1.5, borderRadius: '14px', bgcolor: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(15,23,42,0.15)' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#101c22' }}>{t('moments.map.emptyTitle')}</Typography>
                        <Typography sx={{ fontSize: 13, color: '#5b6b75', mt: 0.25 }}>{t('moments.map.emptyHint')}</Typography>
                    </Box>
                )}
            </Box>

            {/* Several moments at one spot: pick which one to open. */}
            <Dialog open={Boolean(picked)} onClose={() => setPicked(null)} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
                <Box sx={{ px: 2, pt: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#101c22' }}>📍 {picked?.name || t('moments.location.onMap')}</Typography>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1.5 }}>{t('moments.map.momentsHere', { count: picked?.entries.length || 0 })}</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {picked?.entries.map((entry) => (
                            <ButtonBase
                                key={entry.moment.id}
                                onClick={() => {
                                    setPicked(null);
                                    openMoment(entry.moment, entry.photos[0]?.id);
                                }}
                                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: '14px', border: '1px solid #fbcfe8', justifyContent: 'flex-start', textAlign: 'left' }}
                            >
                                <Box sx={{ width: 56, height: 56, borderRadius: '10px', overflow: 'hidden', flexShrink: 0, bgcolor: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {entry.photos[0]
                                        ? <DrivePhoto photo={entry.photos[0]} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        : <span aria-hidden>✨</span>}
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#101c22' }} noWrap>{entry.moment.title || t('moments.untitled')}</Typography>
                                    <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>
                                        {formatMomentDate(entry.moment.date)} · {t('moments.import.photoCount', { count: entry.photos.length })}
                                    </Typography>
                                </Box>
                            </ButtonBase>
                        ))}
                    </Box>
                </Box>
            </Dialog>
            {sheets}
        </Box>
    );
};

export default MomentsMapPage;
