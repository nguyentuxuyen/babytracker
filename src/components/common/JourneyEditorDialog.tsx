import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Dialog, IconButton, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Moment, MomentLocation, PhotoPlace, TRAVEL_MODES, TravelMode } from '../../firebase/moments';
import { Journey, MAX_MOMENTS_PER_JOURNEY, deleteJourney, saveJourney } from '../../firebase/journeys';
import { JourneyStop, guessMode, legKey, tripStops } from '../../utils/journey';
import { SlideUp, bottomSheetProps } from './MomentEditorDialog';
import { formatMomentDate } from './MomentViewer';
import { fieldSx } from './FormControls';
import MomentLocationField from './MomentLocationField';
import { MODE_EMOJI, STOP_EMOJI } from './journeyIcons';

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    /** Every moment of the user (to list the chosen ones and offer more). */
    moments: Moment[];
    /** The trip being changed; a new trip when absent. */
    journey?: Journey | null;
    /** For a new trip: the moments picked on the page. */
    initialMomentIds?: string[];
    onSaved: (journey: Journey) => void;
}

const toField = (place: PhotoPlace | null): MomentLocation | null => (place ? { ...place, source: 'search' } : null);
const fromField = (value: MomentLocation | null): PhotoPlace | null => (value ? { lat: value.lat, lng: value.lng, name: value.name } : null);

// Creates or changes a trip: its name, which moments belong to it, where it starts and
// ends, and how each leg between two points was travelled.
const JourneyEditorDialog: React.FC<Props> = ({ open, onClose, uid, moments, journey, initialMomentIds, onSaved }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [ids, setIds] = useState<string[]>([]);
    const [start, setStart] = useState<PhotoPlace | null>(null);
    const [end, setEnd] = useState<PhotoPlace | null>(null);
    const [modes, setModes] = useState<Record<string, TravelMode>>({});
    const [adding, setAdding] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open) return;
        const chosen = journey?.momentIds || initialMomentIds || [];
        const first = moments.filter((moment) => chosen.includes(moment.id)).sort((a, b) => a.date.localeCompare(b.date)).find((moment) => moment.title.trim());
        setTitle(journey ? journey.title : first?.title.trim() || '');
        setIds(chosen);
        setStart(journey?.start || null);
        setEnd(journey?.end || null);
        setModes(journey?.legModes || {});
        setAdding(false);
        setConfirmDelete(false);
        setBusy(false);
        setFailed(false);
        // Only when the dialog opens: live list updates must not wipe what the user typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const chosenMoments = useMemo(
        () => moments.filter((moment) => ids.includes(moment.id)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
        [moments, ids]
    );
    const otherMoments = moments.filter((moment) => !ids.includes(moment.id));
    const stops = useMemo(() => tripStops(chosenMoments, start, end), [chosenMoments, start, end]);
    const stopName = (stop: JourneyStop) => stop.name || (stop.kind ? t(`moments.trip.${stop.kind}`) : t('moments.location.onMap'));
    let number = 0;

    const save = async () => {
        setBusy(true);
        setFailed(false);
        try {
            // Only the legs that still exist are kept.
            const keys = new Set(stops.slice(1).map((to, i) => legKey(stops[i], to)));
            const legModes = Object.fromEntries(Object.entries(modes).filter(([key]) => keys.has(key)));
            onSaved(await saveJourney(uid, { title, momentIds: chosenMoments.map((moment) => moment.id), start, end, legModes }, journey || undefined));
        } catch (error) {
            console.error('Could not save the journey', error);
            setFailed(true);
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!journey) return;
        setBusy(true);
        try {
            await deleteJourney(uid, journey.id);
            onClose();
        } catch (error) {
            console.error('Could not delete the journey', error);
            setFailed(true);
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
                <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#101c22' }}>
                    {t(journey ? 'moments.trip.editTitle' : 'moments.trip.newTitle')}
                </Typography>
                <IconButton onClick={onClose} disabled={busy} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            <Box sx={{ px: 2, pb: 1, overflowY: 'auto' }}>
                <TextField
                    variant="filled"
                    fullWidth
                    label={t('moments.trip.nameLabel')}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    inputProps={{ maxLength: 120 }}
                    sx={{ ...fieldSx, mb: 2 }}
                />

                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{t('moments.trip.route')}</Typography>
                <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1 }}>{t('moments.trip.routeHint')}</Typography>

                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#9d174d', mb: 0.5 }}>{STOP_EMOJI.start} {t('moments.trip.start')}</Typography>
                <MomentLocationField value={toField(start)} onChange={(value) => setStart(fromField(value))} disabled={busy} addLabel={t('moments.trip.addStart')} />

                <Box data-testid="trip-route" sx={{ mb: 1 }}>
                    {stops.map((stop, i) => {
                        if (!stop.kind) number += 1;
                        const next = stops[i + 1];
                        const key = next ? legKey(stop, next) : '';
                        const mode = next ? modes[key] || guessMode(stop, next) : null;
                        return (
                            <React.Fragment key={`${stop.kind || stop.photos[0]?.id}-${i}`}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                                    <Box sx={{
                                        width: 26, height: 26, flexShrink: 0, borderRadius: '50%', bgcolor: stop.kind ? '#fff' : '#ec4899', color: '#fff',
                                        border: stop.kind ? '2px solid #f9a8d4' : 'none', boxSizing: 'border-box',
                                        fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {stop.kind ? STOP_EMOJI[stop.kind] : number}
                                    </Box>
                                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#101c22' }} noWrap>{stopName(stop)}</Typography>
                                    {stop.photos.length > 0 && (
                                        <Typography sx={{ fontSize: 12, color: '#6b7f8a', flexShrink: 0 }}>{t('moments.import.photoCount', { count: stop.photos.length })}</Typography>
                                    )}
                                </Box>
                                {next && (
                                    <Box role="group" aria-label={`${stopName(stop)} → ${stopName(next)}`} sx={{ display: 'flex', gap: 0.5, ml: '12px', pl: '20px', py: 0.5, borderLeft: '2px dashed #f9a8d4' }}>
                                        {TRAVEL_MODES.map((item) => (
                                            <ButtonBase
                                                key={item}
                                                disabled={busy}
                                                onClick={() => setModes((current) => ({ ...current, [key]: item }))}
                                                aria-label={t(`moments.journey.mode.${item}`)}
                                                aria-pressed={mode === item}
                                                sx={{
                                                    flex: 1, py: 0.5, borderRadius: '10px', fontSize: 18, flexDirection: 'column',
                                                    border: '2px solid', borderColor: mode === item ? '#ec4899' : '#f1f5f9', bgcolor: mode === item ? '#fdf2f8' : '#fff'
                                                }}
                                            >
                                                {MODE_EMOJI[item]}
                                                <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: '#6b7f8a' }}>{t(`moments.journey.mode.${item}`)}</Box>
                                            </ButtonBase>
                                        ))}
                                    </Box>
                                )}
                            </React.Fragment>
                        );
                    })}
                </Box>

                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#9d174d', mb: 0.5, mt: 1 }}>{STOP_EMOJI.end} {t('moments.trip.end')}</Typography>
                <MomentLocationField value={toField(end)} onChange={(value) => setEnd(fromField(value))} disabled={busy} addLabel={t('moments.trip.addEnd')} />
                {start && !end && (
                    <Button disabled={busy} onClick={() => setEnd({ ...start })} sx={{ mt: -1, mb: 2, textTransform: 'none', fontWeight: 700, color: '#be185d' }}>
                        ↩ {t('moments.trip.backToStart')}
                    </Button>
                )}

                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155', mb: 0.75 }}>{t('moments.trip.moments', { count: chosenMoments.length })}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
                    {chosenMoments.map((moment) => (
                        <Box key={moment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1.25, pr: 0.5, py: 0.25, borderRadius: '12px', bgcolor: '#f8fafc' }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#101c22' }} noWrap>{moment.title || t('moments.untitled')}</Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a' }}>{formatMomentDate(moment.date)}</Typography>
                            </Box>
                            <IconButton size="small" disabled={busy} onClick={() => setIds((current) => current.filter((id) => id !== moment.id))} aria-label={t('moments.trip.removeMoment')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#6b7f8a" strokeWidth="2" strokeLinecap="round" /></svg>
                            </IconButton>
                        </Box>
                    ))}
                </Box>
                {otherMoments.length > 0 && chosenMoments.length < MAX_MOMENTS_PER_JOURNEY && (adding ? (
                    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', mb: 1.5, maxHeight: 220, overflowY: 'auto' }}>
                        {otherMoments.map((moment) => (
                            <ButtonBase
                                key={moment.id}
                                onClick={() => setIds((current) => [...current, moment.id])}
                                sx={{ display: 'block', width: '100%', textAlign: 'left', px: 1.5, py: 0.9, borderBottom: '1px solid #f1f5f9' }}
                            >
                                <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#101c22' }} noWrap>＋ {moment.title || t('moments.untitled')}</Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a' }}>{formatMomentDate(moment.date)}</Typography>
                            </ButtonBase>
                        ))}
                    </Box>
                ) : (
                    <Button disabled={busy} onClick={() => setAdding(true)} sx={{ mb: 1.5, textTransform: 'none', fontWeight: 700, color: '#0369a1', bgcolor: '#f0f9ff', borderRadius: '12px', px: 1.5 }}>
                        ＋ {t('moments.trip.addMoment')}
                    </Button>
                ))}

                {stops.length < 2 && <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px' }}>{t('moments.trip.needStops')}</Alert>}
                {failed && <Alert severity="error" sx={{ mb: 1.5, borderRadius: '12px' }}>{t('moments.trip.saveFailed')}</Alert>}
                {confirmDelete && (
                    <Alert
                        severity="warning"
                        sx={{ mb: 1.5, borderRadius: '12px' }}
                        action={<Button color="inherit" size="small" disabled={busy} onClick={() => void remove()} sx={{ fontWeight: 700 }}>{t('moments.delete')}</Button>}
                    >
                        {t('moments.trip.deleteConfirm')}
                    </Alert>
                )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                {journey && (
                    <Button disabled={busy} onClick={() => setConfirmDelete(true)} sx={{ borderRadius: '14px', px: 2, textTransform: 'none', fontWeight: 700, color: '#dc2626', bgcolor: '#fef2f2' }}>
                        {t('moments.delete')}
                    </Button>
                )}
                <Button
                    variant="contained"
                    disabled={busy || stops.length < 2}
                    onClick={() => void save()}
                    sx={{ flex: 1, borderRadius: '14px', py: 1.1, textTransform: 'none', fontWeight: 700, bgcolor: '#ec4899', '&:hover': { bgcolor: '#db2777' } }}
                >
                    ▶ {t('moments.trip.save')}
                </Button>
            </Box>
        </Dialog>
    );
};

export default JourneyEditorDialog;
