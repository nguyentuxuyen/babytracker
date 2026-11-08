import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Dialog, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Moment } from '../../firebase/moments';
import { JourneyStop, along, easeInOut, journeyStops, legDuration } from '../../utils/journey';
import { localeTag } from '../../i18n';
import DrivePhoto from './DrivePhoto';

const STOP_PAUSE_MS = 2200;

interface Props {
    open: boolean;
    onClose: () => void;
    moment: Moment;
}

// Only numbers and fixed emoji go into marker HTML, never user text.
const stopIcon = (number: number, reached: boolean) => L.divIcon({
    className: 'bt-journey-stop',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="bt-stop${reached ? ' bt-stop-reached' : ''}">${number}</div>`
});

const carIcon = (facingEast: boolean) => L.divIcon({
    className: 'bt-journey-car',
    iconSize: [40, 40],
    iconAnchor: [20, 30],
    // The car emoji faces left, so it is mirrored when driving east.
    html: `<div class="bt-car" style="transform:${facingEast ? 'scaleX(-1)' : 'none'}">🚗</div>`
});

const mapStyles = {
    '& .bt-journey-stop, & .bt-journey-car': { background: 'none', border: 'none' },
    '& .bt-stop': {
        width: 28, height: 28, borderRadius: '50%', bgcolor: '#fff', border: '3px solid #f9a8d4', color: '#9d174d',
        fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        boxShadow: '0 1px 4px rgba(15,23,42,0.3)', transition: 'all 0.3s'
    },
    '& .bt-stop-reached': { bgcolor: '#ec4899', borderColor: '#fff', color: '#fff' },
    '& .bt-car': { fontSize: 32, lineHeight: '40px', textAlign: 'center', filter: 'drop-shadow(0 2px 3px rgba(15,23,42,0.4))' }
} as const;

const timeLabel = (takenAt: string | null) => {
    if (!takenAt) return '';
    const date = new Date(takenAt);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString(localeTag(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// "Hành trình": a car drives from where one photo was taken to the next, stopping to show
// the photos at each place. Legs are straight lines between places (no road data).
const MomentJourneyDialog: React.FC<Props> = ({ open, onClose, moment }) => {
    const { t } = useTranslation();
    const stops = React.useMemo(() => journeyStops(moment), [moment]);
    const [mapNode, setMapNode] = useState<HTMLDivElement | null>(null);
    const [current, setCurrent] = useState<{ stop: JourneyStop; index: number } | null>(null);
    const [finished, setFinished] = useState(false);
    const [run, setRun] = useState(0);
    const map = useRef<L.Map | null>(null);

    // Map: created when the dialog's map box mounts, removed when it closes.
    useEffect(() => {
        if (!mapNode || stops.length < 2) return undefined;
        const created = L.map(mapNode, { zoomControl: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(created);
        created.fitBounds(L.latLngBounds(stops.map((stop) => [stop.lat, stop.lng] as [number, number])), { padding: [60, 60], maxZoom: 14 });
        map.current = created;
        return () => {
            created.remove();
            map.current = null;
        };
    }, [mapNode, stops]);

    // The animation; starting a new run (replay) or closing stops the old one.
    useEffect(() => {
        const target = map.current;
        if (!open || !target || stops.length < 2) return undefined;
        let cancelled = false;
        let frame = 0;
        const timers: number[] = [];
        const layers = L.layerGroup().addTo(target);
        const stopMarkers = stops.map((stop, i) => L.marker([stop.lat, stop.lng], { icon: stopIcon(i + 1, i === 0), interactive: false }).addTo(layers));
        L.polyline(stops.map((stop) => [stop.lat, stop.lng] as [number, number]), { color: '#f9a8d4', weight: 3, dashArray: '6 8', opacity: 0.9 }).addTo(layers);
        // The solid trail: every stop reached so far, then the car's position.
        const visited: L.LatLngExpression[] = [[stops[0].lat, stops[0].lng]];
        const trail = L.polyline(visited, { color: '#ec4899', weight: 5, opacity: 0.95 }).addTo(layers);
        const car = L.marker([stops[0].lat, stops[0].lng], { icon: carIcon(stops[1].lng > stops[0].lng), interactive: false, zIndexOffset: 1000 }).addTo(layers);
        setFinished(false);

        const wait = (ms: number) => new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, ms)); });
        const drive = (from: JourneyStop, to: JourneyStop) => new Promise<void>((resolve) => {
            const duration = legDuration(from, to);
            const start = performance.now();
            car.setIcon(carIcon(to.lng > from.lng));
            const step = (now: number) => {
                if (cancelled) return resolve();
                const fraction = Math.min(1, (now - start) / duration);
                const point = along(from, to, easeInOut(fraction));
                car.setLatLng([point.lat, point.lng]);
                trail.setLatLngs([...visited, [point.lat, point.lng]]);
                if (fraction < 1) {
                    frame = requestAnimationFrame(step);
                } else {
                    visited.push([to.lat, to.lng]);
                    resolve();
                }
            };
            frame = requestAnimationFrame(step);
        });

        (async () => {
            setCurrent({ stop: stops[0], index: 0 });
            await wait(STOP_PAUSE_MS);
            for (let i = 1; i < stops.length && !cancelled; i += 1) {
                setCurrent(null);
                await drive(stops[i - 1], stops[i]);
                if (cancelled) return;
                stopMarkers[i].setIcon(stopIcon(i + 1, true));
                setCurrent({ stop: stops[i], index: i });
                await wait(STOP_PAUSE_MS);
            }
            if (!cancelled) setFinished(true);
        })();

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            timers.forEach((timer) => window.clearTimeout(timer));
            layers.remove();
        };
    }, [open, stops, run, mapNode]);

    return (
        <Dialog open={open} onClose={onClose} fullScreen>
            <Box sx={{ position: 'relative', height: '100%', bgcolor: '#e5e7eb', ...mapStyles }}>
                <Box ref={setMapNode} sx={{ position: 'absolute', inset: 0 }} />

                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, pt: 'calc(10px + env(safe-area-inset-top))', pb: 1, background: 'linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0))'
                }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#101c22' }} noWrap>🚗 {moment.title || t('moments.untitled')}</Typography>
                        <Typography sx={{ fontSize: 12, color: '#475569' }}>{t('moments.journey.stops', { count: stops.length })}</Typography>
                    </Box>
                    <IconButton onClick={onClose} aria-label={t('common.close')} sx={{ bgcolor: '#fff', boxShadow: '0 1px 4px rgba(15,23,42,0.2)', '&:hover': { bgcolor: '#fff' } }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </IconButton>
                </Box>

                <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 1000 }}>
                    {current && (
                        <Box key={current.index} sx={{
                            display: 'flex', gap: 1.25, p: 1, borderRadius: '18px', bgcolor: '#fff', boxShadow: '0 4px 16px rgba(15,23,42,0.25)',
                            animation: 'journeyCardIn 0.35s ease-out', '@keyframes journeyCardIn': { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'none' } }
                        }}>
                            <Box sx={{ width: 96, height: 96, borderRadius: '12px', overflow: 'hidden', flexShrink: 0, bgcolor: '#f1f5f9' }}>
                                <DrivePhoto photo={current.stop.photos[0]} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </Box>
                            <Box sx={{ minWidth: 0, py: 0.5 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#ec4899' }}>
                                    {t('moments.journey.stopOf', { index: current.index + 1, count: stops.length })}
                                </Typography>
                                <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#101c22', lineHeight: 1.3 }}>
                                    📍 {current.stop.name || t('moments.location.onMap')}
                                </Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a', mt: 0.25 }}>
                                    {[timeLabel(current.stop.takenAt), t('moments.import.photoCount', { count: current.stop.photos.length })].filter(Boolean).join(' · ')}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                    {finished && (
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={() => setRun((value) => value + 1)}
                            sx={{ mt: 1, borderRadius: '14px', py: 1.1, textTransform: 'none', fontWeight: 700, bgcolor: '#ec4899', '&:hover': { bgcolor: '#db2777' } }}
                        >
                            ↻ {t('moments.journey.replay')}
                        </Button>
                    )}
                </Box>
            </Box>
        </Dialog>
    );
};

export default MomentJourneyDialog;
