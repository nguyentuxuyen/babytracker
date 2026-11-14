import React, { useCallback, useMemo, useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Moment } from '../../firebase/moments';
import { Journey, saveJourneyLegModes } from '../../firebase/journeys';
import { useJourneys } from '../../hooks/useJourneys';
import { tripStops } from '../../utils/journey';
import { formatMomentDate } from './MomentViewer';
import DrivePhoto from './DrivePhoto';
import JourneyEditorDialog from './JourneyEditorDialog';

// Leaflet is only loaded when a journey is played.
const MomentJourneyDialog = React.lazy(() => import('./MomentJourneyDialog'));

const tripMoments = (journey: Journey, moments: Moment[]) => moments
    .filter((moment) => journey.momentIds.includes(moment.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

/**
 * Trips ("hành trình") on the moments page: the row of saved trips, the editor that
 * creates or changes one, and the animated player.
 */
export const useJourneySheets = (uid: string | undefined, moments: Moment[]) => {
    const { t } = useTranslation();
    const journeys = useJourneys(uid);
    const [editing, setEditing] = useState<{ journey: Journey | null; momentIds: string[] } | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    // The saved trip is shown at once, before the live list catches up.
    const [justSaved, setJustSaved] = useState<Journey | null>(null);

    const playing = playingId ? journeys.find((journey) => journey.id === playingId) || (justSaved?.id === playingId ? justSaved : null) : null;
    const playingStops = useMemo(
        () => (playing ? tripStops(tripMoments(playing, moments), playing.start, playing.end) : []),
        [playing, moments]
    );

    const createJourney = useCallback((momentIds: string[]) => setEditing({ journey: null, momentIds }), []);
    const open = (journey: Journey) => {
        // A trip that lost its places (moments deleted) opens for editing instead.
        if (tripStops(tripMoments(journey, moments), journey.start, journey.end).length < 2) setEditing({ journey, momentIds: journey.momentIds });
        else setPlayingId(journey.id);
    };

    const row = journeys.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#475569', mb: 1 }}>🧭 {t('moments.trip.sectionTitle')}</Typography>
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mx: -2, px: 2, pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                {journeys.map((journey) => {
                    const items = tripMoments(journey, moments);
                    const cover = items.find((moment) => moment.photos.length)?.photos[0];
                    const first = items[0]?.date;
                    const last = items[items.length - 1]?.date;
                    return (
                        <ButtonBase
                            key={journey.id}
                            onClick={() => open(journey)}
                            sx={{
                                flex: '0 0 auto', width: 220, display: 'flex', alignItems: 'center', gap: 1.25, p: 1, textAlign: 'left', justifyContent: 'flex-start',
                                borderRadius: '16px', bgcolor: '#fff', border: '1px solid #fbcfe8'
                            }}
                        >
                            <Box sx={{ width: 52, height: 52, flexShrink: 0, borderRadius: '12px', overflow: 'hidden', bgcolor: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                                {cover ? <DrivePhoto photo={cover} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span aria-hidden>🧭</span>}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#101c22' }} noWrap>{journey.title || t('moments.trip.untitled')}</Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a' }} noWrap>
                                    {first ? (first === last ? formatMomentDate(first, { day: 'numeric', month: 'short', year: 'numeric' })
                                        : `${formatMomentDate(first, { day: 'numeric', month: 'short' })} – ${formatMomentDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}`) : ''}
                                </Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#be185d' }} noWrap>▶ {t('moments.trip.cardSummary', { count: items.length })}</Typography>
                            </Box>
                        </ButtonBase>
                    );
                })}
            </Box>
        </Box>
    );

    const sheets = uid ? (
        <>
            <JourneyEditorDialog
                open={Boolean(editing)}
                onClose={() => setEditing(null)}
                uid={uid}
                moments={moments}
                journey={editing?.journey}
                initialMomentIds={editing?.momentIds}
                onSaved={(journey) => {
                    setEditing(null);
                    setJustSaved(journey);
                    setPlayingId(journey.id);
                }}
            />
            {playing && playingStops.length > 1 && (
                <React.Suspense fallback={null}>
                    <MomentJourneyDialog
                        open
                        onClose={() => setPlayingId(null)}
                        id={playing.id}
                        title={playing.title || t('moments.trip.untitled')}
                        stops={playingStops}
                        legModes={playing.legModes}
                        onSaveModes={(modes) => saveJourneyLegModes(uid, playing.id, modes)}
                        onEdit={() => {
                            setPlayingId(null);
                            setEditing({ journey: playing, momentIds: playing.momentIds });
                        }}
                    />
                </React.Suspense>
            )}
        </>
    ) : null;

    return { row, createJourney, sheets };
};
