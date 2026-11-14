import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, Dialog, IconButton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TRAVEL_MODES, TravelMode } from '../../firebase/moments';
import {
    JourneyStop,
    LatLng,
    alongPath,
    easeInOut,
    flightArc,
    guessMode,
    legDuration,
    legKey
} from '../../utils/journey';
import { roadRoute } from '../../services/routing';
import { localeTag } from '../../i18n';
import { SlideUp, bottomSheetProps } from './MomentEditorDialog';
import DrivePhoto from './DrivePhoto';
import { MODE_EMOJI, STOP_EMOJI } from './journeyIcons';

const STOP_PAUSE_MS = 2200;


interface Props {
    open: boolean;
    onClose: () => void;
    /** The moment or trip being played; another id starts over with its own choices. */
    id: string;
    title: string;
    stops: JourneyStop[];
    legModes: Record<string, TravelMode>;
    onSaveModes: (modes: Record<string, TravelMode>) => Promise<void>;
    /** Shows an edit button (trips: change the start, the end, the moments). */
    onEdit?: () => void;
}

interface Leg {
    key: string;
    from: JourneyStop;
    to: JourneyStop;
    mode: TravelMode;
    path: LatLng[];
}

// Only numbers and fixed emoji go into marker HTML, never user text.
const stopIcon = (stop: JourneyStop, number: number, reached: boolean) => L.divIcon({
    className: 'bt-journey-stop',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="bt-stop${reached ? ' bt-stop-reached' : ''}">${stop.kind ? STOP_EMOJI[stop.kind] : number}</div>`
});

// The emoji face left (✈️ points up-right), so they are turned to match the heading.
const vehicleTransform = (mode: TravelMode, heading: number) => (mode === 'plane'
    ? `rotate(${45 - heading}deg)`
    : Math.abs(heading) < 90 ? 'scaleX(-1)' : 'none');

const vehicleIcon = (mode: TravelMode, heading: number) => L.divIcon({
    className: 'bt-journey-car',
    iconSize: [40, 40],
    iconAnchor: [20, 26],
    html: `<div class="bt-car" style="transform:${vehicleTransform(mode, heading)}">${MODE_EMOJI[mode]}</div>`
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

// Path for one leg: real roads by car (OSRM), a curve for flights, a straight line otherwise.
// A car leg with no road at all (across the sea) becomes a boat unless the user chose the car.
const planLeg = async (from: JourneyStop, to: JourneyStop, mode: TravelMode, chosen: boolean): Promise<{ mode: TravelMode; path: LatLng[] }> => {
    const straight = [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
    if (mode === 'plane') return { mode, path: flightArc(from, to) };
    if (mode !== 'car') return { mode, path: straight };
    const road = await roadRoute(from, to);
    if (road === 'no-road') return { mode: chosen ? 'car' : 'ship', path: straight };
    return { mode, path: road && road.length > 1 ? [straight[0], ...road, straight[1]] : straight };
};

// "Hành trình": a vehicle travels from where one photo was taken to the next, stopping to
// show the photos at each place. Each leg's way of travel can be changed and is saved.
const MomentJourneyDialog: React.FC<Props> = ({ open, onClose, id, title, stops, legModes, onSaveModes, onEdit }) => {
    const { t } = useTranslation();
    const [chosen, setChosen] = useState<Record<string, TravelMode>>(legModes);
    // Stops with photos are numbered 1, 2, 3…; the start and end points carry an icon instead.
    const numbers = useMemo(() => {
        let count = 0;
        return stops.map((stop) => (stop.kind ? 0 : (count += 1)));
    }, [stops]);
    const photoStops = numbers.filter(Boolean).length;
    const stopName = (stop: JourneyStop) => stop.name || (stop.kind ? t(`moments.trip.${stop.kind}`) : t('moments.location.onMap'));
    const [legs, setLegs] = useState<Leg[] | null>(null);
    const [mapNode, setMapNode] = useState<HTMLDivElement | null>(null);
    const [current, setCurrent] = useState<{ stop: JourneyStop; index: number } | null>(null);
    const [finished, setFinished] = useState(false);
    const [modesOpen, setModesOpen] = useState(false);
    const [run, setRun] = useState(0);
    const map = useRef<L.Map | null>(null);

    useEffect(() => { if (open) setChosen(legModes); }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Work out every leg's way and path (road lookups run together).
    useEffect(() => {
        if (!open || stops.length < 2) return undefined;
        let active = true;
        setLegs(null);
        Promise.all(stops.slice(1).map(async (to, i) => {
            const from = stops[i];
            const key = legKey(from, to);
            const planned = await planLeg(from, to, chosen[key] || guessMode(from, to), Boolean(chosen[key]));
            return { key, from, to, ...planned };
        })).then((planned) => { if (active) setLegs(planned); });
        return () => { active = false; };
    }, [open, stops, chosen]);

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

    // The animation; a new run (replay, changed way of travel) or closing stops the old one.
    useEffect(() => {
        const target = map.current;
        if (!open || !target || !legs || modesOpen) return undefined;
        let cancelled = false;
        let frame = 0;
        const timers: number[] = [];
        const layers = L.layerGroup().addTo(target);
        const stopMarkers = stops.map((stop, i) => L.marker([stop.lat, stop.lng], { icon: stopIcon(stop, numbers[i], i === 0), interactive: false }).addTo(layers));
        legs.forEach((leg) => {
            L.polyline(leg.path.map((p) => [p.lat, p.lng] as [number, number]), {
                color: '#f9a8d4', weight: 3, dashArray: leg.mode === 'plane' || leg.mode === 'ship' ? '2 8' : '6 8', opacity: 0.9
            }).addTo(layers);
        });
        // The solid trail: everything travelled so far, then the vehicle's position.
        const travelled: Array<[number, number]> = [[stops[0].lat, stops[0].lng]];
        const trail = L.polyline(travelled, { color: '#ec4899', weight: 5, opacity: 0.95 }).addTo(layers);
        const vehicle = L.marker([stops[0].lat, stops[0].lng], { icon: vehicleIcon(legs[0].mode, 180), interactive: false, zIndexOffset: 1000 }).addTo(layers);
        setFinished(false);

        const wait = (ms: number) => new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, ms)); });
        const travel = (leg: Leg) => new Promise<void>((resolve) => {
            const duration = leg.mode === 'plane' ? 3800 : legDuration(leg.from, leg.to) * (leg.path.length > 2 && leg.mode === 'car' ? 1.3 : 1);
            const start = performance.now();
            const base = travelled.length;
            let lastHeading = Number.NaN;
            const step = (now: number) => {
                if (cancelled) return resolve();
                const fraction = Math.min(1, (now - start) / duration);
                const { point, heading, index } = alongPath(leg.path, easeInOut(fraction));
                vehicle.setLatLng([point.lat, point.lng]);
                // Re-render the icon only when the direction changes noticeably.
                if (Number.isNaN(lastHeading) || Math.abs(heading - lastHeading) > 8) {
                    vehicle.setIcon(vehicleIcon(leg.mode, heading));
                    lastHeading = heading;
                }
                travelled.length = base;
                leg.path.slice(0, index + 1).forEach((p) => travelled.push([p.lat, p.lng]));
                trail.setLatLngs([...travelled, [point.lat, point.lng]]);
                if (fraction < 1) frame = requestAnimationFrame(step);
                else resolve();
            };
            frame = requestAnimationFrame(step);
        });

        (async () => {
            setCurrent({ stop: stops[0], index: 0 });
            await wait(STOP_PAUSE_MS);
            for (let i = 0; i < legs.length && !cancelled; i += 1) {
                setCurrent(null);
                // Follow the trip: frame this leg (short hops zoom in, flights zoom out).
                target.flyToBounds(L.latLngBounds(legs[i].path.map((p) => [p.lat, p.lng] as [number, number])), { padding: [70, 70], maxZoom: 14, duration: 0.8 });
                await wait(900);
                if (cancelled) return;
                await travel(legs[i]);
                if (cancelled) return;
                stopMarkers[i + 1].setIcon(stopIcon(stops[i + 1], numbers[i + 1], true));
                setCurrent({ stop: stops[i + 1], index: i + 1 });
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
    }, [open, stops, legs, run, mapNode, modesOpen, numbers]);

    const chooseMode = (key: string, mode: TravelMode) => {
        const next = { ...chosen, [key]: mode };
        setChosen(next);
        onSaveModes(next).catch((error) => console.warn('Could not save travel modes', error));
    };

    return (
        <Dialog open={open} onClose={onClose} fullScreen>
            <Box sx={{ position: 'relative', height: '100%', bgcolor: '#e5e7eb', ...mapStyles }}>
                <Box ref={setMapNode} sx={{ position: 'absolute', inset: 0 }} />

                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, pt: 'calc(10px + env(safe-area-inset-top))', pb: 1, background: 'linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0))'
                }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#101c22' }} noWrap>{title || t('moments.untitled')}</Typography>
                        <Typography sx={{ fontSize: 12, color: '#475569' }}>
                            {legs ? t('moments.journey.stops', { count: photoStops }) : t('moments.journey.finding')}
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        disabled={!legs}
                        onClick={() => setModesOpen(true)}
                        sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#be185d', bgcolor: '#fff', boxShadow: '0 1px 4px rgba(15,23,42,0.2)', '&:hover': { bgcolor: '#fff' } }}
                    >
                        {legs ? [...new Set(legs.map((leg) => MODE_EMOJI[leg.mode]))].join('') : '…'} {t('moments.journey.modes')}
                    </Button>
                    {onEdit && (
                        <Button
                            size="small"
                            onClick={onEdit}
                            sx={{ minWidth: 0, borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#0369a1', bgcolor: '#fff', boxShadow: '0 1px 4px rgba(15,23,42,0.2)', '&:hover': { bgcolor: '#fff' } }}
                        >
                            {t('moments.edit')}
                        </Button>
                    )}
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
                            <Box sx={{ width: 96, height: 96, borderRadius: '12px', overflow: 'hidden', flexShrink: 0, bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                                {current.stop.photos[0]
                                    ? <DrivePhoto photo={current.stop.photos[0]} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    : <span aria-hidden>{STOP_EMOJI[current.stop.kind || 'start']}</span>}
                            </Box>
                            <Box sx={{ minWidth: 0, py: 0.5 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#ec4899' }}>
                                    {current.stop.kind
                                        ? t(`moments.trip.${current.stop.kind}`)
                                        : t('moments.journey.stopOf', { index: numbers[current.index], count: photoStops })}
                                </Typography>
                                <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#101c22', lineHeight: 1.3 }}>
                                    📍 {stopName(current.stop)}
                                </Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a', mt: 0.25 }}>
                                    {[timeLabel(current.stop.takenAt), current.stop.photos.length ? t('moments.import.photoCount', { count: current.stop.photos.length }) : ''].filter(Boolean).join(' · ')}
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

            {/* How each leg was travelled; the animation restarts with the new choice. */}
            <Dialog open={modesOpen} onClose={() => setModesOpen(false)} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
                <Box sx={{ px: 2, pt: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#101c22' }}>{t('moments.journey.modesTitle')}</Typography>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1.5 }}>{t('moments.journey.modesHint')}</Typography>
                    {legs?.map((leg, i) => (
                        <Box key={leg.key} sx={{ py: 1, borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155', mb: 0.75 }} noWrap>
                                {stopName(leg.from)} → {stopName(leg.to)}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.75 }}>
                                {TRAVEL_MODES.map((mode) => (
                                    <ButtonBase
                                        key={mode}
                                        onClick={() => chooseMode(leg.key, mode)}
                                        aria-label={t(`moments.journey.mode.${mode}`)}
                                        aria-pressed={leg.mode === mode}
                                        sx={{
                                            flex: 1, py: 0.75, borderRadius: '12px', fontSize: 22, flexDirection: 'column',
                                            border: '2px solid', borderColor: leg.mode === mode ? '#ec4899' : '#f1f5f9',
                                            bgcolor: leg.mode === mode ? '#fdf2f8' : '#fff'
                                        }}
                                    >
                                        {MODE_EMOJI[mode]}
                                        <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: '#6b7f8a' }}>{t(`moments.journey.mode.${mode}`)}</Box>
                                    </ButtonBase>
                                ))}
                            </Box>
                        </Box>
                    ))}
                    <Button fullWidth variant="contained" onClick={() => setModesOpen(false)}
                        sx={{ mt: 1.5, borderRadius: '14px', py: 1.1, textTransform: 'none', fontWeight: 700, bgcolor: '#ec4899', '&:hover': { bgcolor: '#db2777' } }}>
                        ▶ {t('moments.journey.replay')}
                    </Button>
                </Box>
            </Dialog>
        </Dialog>
    );
};

export default MomentJourneyDialog;
