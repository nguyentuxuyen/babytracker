import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, IconButton, LinearProgress, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { MAX_PHOTOS_PER_MOMENT, MomentErrorCode, saveMoment, toMomentError } from '../../firebase/moments';
import { connectDrive } from '../../firebase/googleDrive';
import { useDriveStatus } from '../../hooks/useDriveStatus';
import { readPhotoMeta } from '../../utils/photoExif';
import { ImportDay, groupPhotosByDay } from '../../utils/photoImport';
import { reverseGeocode } from '../../services/geocode';
import { SlideUp, bottomSheetProps, momentErrorKey } from './MomentEditorDialog';
import { formatMomentDate } from './MomentViewer';
import { fieldSx } from './FormControls';

const MAX_IMPORT_PHOTOS = 300;
const THUMBS_PER_DAY = 4;
// Nominatim asks for at most one request per second.
const GEOCODE_GAP_MS = 1100;

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
}

interface DayDraft extends ImportDay {
    selected: boolean;
    title: string;
    placeName: string;
    thumbs: string[];
}

type Step = 'pick' | 'reading' | 'review' | 'saving';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Picks many photos at once and turns them into one moment per day they were taken,
// with the place from the photos' GPS. The days can be reviewed, named or dropped first.
const MomentImportDialog: React.FC<Props> = ({ open, onClose, uid }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState<Step>('pick');
    const [days, setDays] = useState<DayDraft[]>([]);
    const [readCount, setReadCount] = useState({ done: 0, total: 0 });
    const [tooMany, setTooMany] = useState(false);
    const [progress, setProgress] = useState({ day: 0, days: 0, photo: 0, photos: 0, fraction: 0 });
    const [error, setError] = useState<MomentErrorCode | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const runId = useRef(0);
    const { status: driveStatus } = useDriveStatus(open);
    const driveReady = !driveStatus || (driveStatus.configured && driveStatus.connected);

    const releaseThumbs = (list: DayDraft[]) => list.forEach((day) => day.thumbs.forEach((url) => URL.revokeObjectURL(url)));

    useEffect(() => {
        if (!open) return undefined;
        runId.current += 1;
        setStep('pick');
        setDays([]);
        setError(null);
        setTooMany(false);
        setSavedCount(0);
        return () => { runId.current += 1; };
    }, [open]);

    // Thumbnails are object URLs: free them when the list changes or the dialog closes.
    const daysRef = useRef<DayDraft[]>([]);
    useEffect(() => { daysRef.current = days; }, [days]);
    useEffect(() => () => releaseThumbs(daysRef.current), []);

    const updateDay = (date: string, patch: Partial<DayDraft>) =>
        setDays((current) => current.map((day) => (day.date === date ? { ...day, ...patch } : day)));

    const lookUpPlaces = async (list: DayDraft[], run: number) => {
        for (const day of list) {
            if (!day.gps) continue;
            const name = await reverseGeocode(day.gps.lat, day.gps.lng);
            if (runId.current !== run) return;
            if (name) setDays((current) => current.map((item) => (item.date === day.date && !item.placeName ? { ...item, placeName: name } : item)));
            await wait(GEOCODE_GAP_MS);
        }
    };

    const handleFiles = async (fileList: FileList | null) => {
        const picked = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
        if (inputRef.current) inputRef.current.value = '';
        if (!picked.length) return;
        const files = picked.slice(0, MAX_IMPORT_PHOTOS);
        setTooMany(picked.length > files.length);
        const run = ++runId.current;
        setStep('reading');
        setReadCount({ done: 0, total: files.length });
        const photos = [];
        for (let i = 0; i < files.length; i += 1) {
            photos.push({ file: files[i], meta: await readPhotoMeta(files[i]) });
            if (i % 10 === 9) setReadCount({ done: i + 1, total: files.length });
            if (runId.current !== run) return;
        }
        releaseThumbs(daysRef.current);
        const drafts: DayDraft[] = groupPhotosByDay(photos, MAX_PHOTOS_PER_MOMENT).map((day) => ({
            ...day,
            selected: true,
            title: '',
            placeName: '',
            thumbs: day.photos.slice(0, THUMBS_PER_DAY).map((file) => URL.createObjectURL(file))
        }));
        setDays(drafts);
        setStep('review');
        void lookUpPlaces(drafts, run);
    };

    const chosen = useMemo(() => days.filter((day) => day.selected), [days]);
    const chosenPhotos = chosen.reduce((sum, day) => sum + day.photos.length, 0);

    const handleImport = async () => {
        const run = runId.current;
        setStep('saving');
        setError(null);
        let saved = 0;
        for (let i = 0; i < chosen.length; i += 1) {
            const day = chosen[i];
            try {
                await saveMoment(uid, null, {
                    title: day.title,
                    date: day.date,
                    note: '',
                    keptPhotos: [],
                    newFiles: day.photos,
                    location: day.gps ? { ...day.gps, name: day.placeName, source: 'photo' } : null
                }, (photo, photos, fraction) => setProgress({ day: i, days: chosen.length, photo, photos, fraction }));
            } catch (saveError) {
                if (runId.current !== run) return;
                setError(toMomentError(saveError).code);
                setSavedCount(saved);
                // Keep only the days that are not saved yet, so trying again does not duplicate.
                setDays((current) => current.filter((item) => !chosen.slice(0, i).some((done) => done.date === item.date)));
                setStep('review');
                return;
            }
            saved += 1;
        }
        if (runId.current === run) onClose();
    };

    const busy = step === 'reading' || step === 'saving';
    const overall = progress.days
        ? ((progress.day + (progress.photos ? (progress.photo + progress.fraction) / progress.photos : 0)) / progress.days) * 100
        : 0;

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
                <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#101c22' }}>{t('moments.import.title')}</Typography>
                <IconButton onClick={onClose} disabled={busy} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            <Box sx={{ px: 2, pb: 1, overflowY: 'auto' }}>
                {!driveReady && driveStatus && (
                    <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '14px', bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Typography sx={{ fontSize: 13, color: '#1e3a8a', mb: driveStatus.configured ? 1 : 0 }}>
                            {driveStatus.configured ? t('moments.drive.needConnect') : t('moments.errors.driveNotConfigured')}
                        </Typography>
                        {driveStatus.configured && (
                            <Button size="small" variant="contained" onClick={() => void connectDrive()}
                                sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec' }}>
                                {t('moments.drive.connect')}
                            </Button>
                        )}
                    </Box>
                )}

                {step === 'pick' && (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                        <Typography sx={{ fontSize: 40 }} aria-hidden>🗂️</Typography>
                        <Typography sx={{ fontSize: 14, color: '#475569', mt: 1, mb: 2 }}>
                            {t('moments.import.hint', { max: MAX_IMPORT_PHOTOS })}
                        </Typography>
                        <Button variant="contained" disabled={!driveReady} onClick={() => inputRef.current?.click()}
                            sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}>
                            {t('moments.import.choose')}
                        </Button>
                    </Box>
                )}

                {step === 'reading' && (
                    <Box sx={{ py: 3 }}>
                        <Typography sx={{ fontSize: 14, color: '#475569', mb: 1 }}>{t('moments.import.reading', readCount)}</Typography>
                        <LinearProgress variant="determinate" value={readCount.total ? (readCount.done / readCount.total) * 100 : 0} sx={{ borderRadius: 3, height: 6 }} />
                    </Box>
                )}

                {(step === 'review' || step === 'saving') && (
                    <>
                        <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1.5 }}>
                            {savedCount > 0 ? t('moments.import.partlySaved', { count: savedCount }) : t('moments.import.reviewHint')}
                        </Typography>
                        {tooMany && <Alert severity="info" sx={{ mb: 1.5 }}>{t('moments.import.tooMany', { max: MAX_IMPORT_PHOTOS })}</Alert>}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {days.map((day) => (
                                <Box key={day.date} sx={{
                                    p: 1.25, borderRadius: '14px', border: '1px solid', borderColor: day.selected ? '#fbcfe8' : '#e5e7eb',
                                    bgcolor: day.selected ? '#fff' : '#f8fafc', opacity: day.selected ? 1 : 0.6
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Checkbox
                                            checked={day.selected}
                                            disabled={step === 'saving'}
                                            onChange={(event) => updateDay(day.date, { selected: event.target.checked })}
                                            inputProps={{ 'aria-label': formatMomentDate(day.date) }}
                                            sx={{ p: 0.5, color: '#ec4899', '&.Mui-checked': { color: '#ec4899' } }}
                                        />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#101c22' }}>
                                                {formatMomentDate(day.date)}
                                                <Box component="span" sx={{ fontWeight: 500, color: '#6b7f8a' }}> · {t('moments.import.photoCount', { count: day.photos.length })}</Box>
                                            </Typography>
                                            {(day.placeName || day.fromFileDate || day.skipped > 0) && (
                                                <Typography sx={{ fontSize: 12, color: '#9d174d' }} noWrap>
                                                    {[
                                                        day.placeName && `📍 ${day.placeName}`,
                                                        day.fromFileDate && t('moments.import.fileDate'),
                                                        day.skipped > 0 && t('moments.import.skipped', { count: day.skipped, max: MAX_PHOTOS_PER_MOMENT })
                                                    ].filter(Boolean).join(' · ')}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 0.75, mt: 1, pl: 4.5 }}>
                                        {day.thumbs.map((url) => (
                                            <Box key={url} component="img" src={url} alt="" sx={{ width: 48, height: 48, borderRadius: '8px', objectFit: 'cover', bgcolor: '#f1f5f9' }} />
                                        ))}
                                        {day.photos.length > day.thumbs.length && (
                                            <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: '#fdf2f8', color: '#be185d', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                +{day.photos.length - day.thumbs.length}
                                            </Box>
                                        )}
                                    </Box>
                                    {day.selected && (
                                        <TextField
                                            variant="filled"
                                            size="small"
                                            fullWidth
                                            disabled={step === 'saving'}
                                            label={t('moments.import.nameLabel')}
                                            placeholder={t('moments.namePlaceholder')}
                                            value={day.title}
                                            onChange={(event) => updateDay(day.date, { title: event.target.value })}
                                            inputProps={{ maxLength: 120 }}
                                            sx={{ ...fieldSx, mt: 1 }}
                                        />
                                    )}
                                </Box>
                            ))}
                        </Box>
                    </>
                )}
            </Box>

            {step === 'saving' && (
                <Box sx={{ px: 2, pb: 1 }}>
                    <Typography sx={{ fontSize: 13, color: '#475569', mb: 0.5 }}>
                        {t('moments.import.saving', { day: progress.day + 1, days: progress.days, photo: progress.photo + 1, photos: progress.photos })}
                    </Typography>
                    <LinearProgress variant="determinate" value={overall} sx={{ borderRadius: 3, height: 6 }} />
                </Box>
            )}
            {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError(null)}>{t(momentErrorKey(error))}</Alert>}

            {(step === 'review' || step === 'saving') && (
                <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                    <Button disabled={step === 'saving'} onClick={() => inputRef.current?.click()}
                        sx={{ flex: '0 0 auto', borderRadius: '14px', textTransform: 'none', fontWeight: 600, color: '#0369a1', bgcolor: '#f0f9ff' }}>
                        {t('moments.import.chooseAgain')}
                    </Button>
                    <Button fullWidth variant="contained" disabled={step === 'saving' || !chosen.length || !driveReady} onClick={() => void handleImport()}
                        sx={{ borderRadius: '14px', py: 1.25, textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}>
                        {step === 'saving' ? t('moments.saving') : t('moments.import.create', { count: chosen.length, photos: chosenPhotos })}
                    </Button>
                </Box>
            )}

            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => void handleFiles(event.target.files)} />
        </Dialog>
    );
};

export default MomentImportDialog;
