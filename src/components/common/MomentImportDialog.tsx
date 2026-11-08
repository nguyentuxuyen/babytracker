import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, IconButton, LinearProgress, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { MAX_PHOTOS_PER_MOMENT, MomentErrorCode, saveMoment, toMomentError } from '../../firebase/moments';
import { connectDrive } from '../../firebase/googleDrive';
import { useDriveStatus } from '../../hooks/useDriveStatus';
import { isImageFile, readPhotoMeta } from '../../utils/photoExif';
import { ImportDay, groupPhotosByDay, summarizeGroup } from '../../utils/photoImport';
import { reverseGeocode } from '../../services/geocode';
import { SlideUp, bottomSheetProps, momentErrorKey } from './MomentEditorDialog';
import { formatMomentDate } from './MomentViewer';
import { fieldSx } from './FormControls';

const MAX_IMPORT_PHOTOS = 300;
const THUMBS_PER_GROUP = 4;
// Nominatim asks for at most one request per second.
const GEOCODE_GAP_MS = 1100;

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    /** Photos to start with (from the moment editor's "split" button). */
    initialFiles?: File[] | null;
}

interface DayDraft extends ImportDay {
    placeName: string;
    thumbs: string[];
}

// One future moment: one day, or several days the user merged, with a shared name and note.
interface GroupDraft {
    key: string;
    days: DayDraft[];
    selected: boolean;
    title: string;
    note: string;
    /** Date for a group whose photos have no date at all. */
    pickedDate: string;
}

type Step = 'pick' | 'reading' | 'review' | 'saving';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const groupKey = (days: DayDraft[]) => days.map((day) => day.id).join('+');
const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const singleGroup = (day: DayDraft, base?: Partial<GroupDraft>): GroupDraft => ({
    key: groupKey([day]), days: [day], selected: true, title: '', note: '', pickedDate: today(), ...base
});

// Picks many photos at once and splits them by the day they were taken, with the place from
// the photos' GPS. Days can be merged into one event, named, given a note, or dropped.
const MomentImportDialog: React.FC<Props> = ({ open, onClose, uid, initialFiles }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState<Step>('pick');
    const [groups, setGroups] = useState<GroupDraft[]>([]);
    const [readCount, setReadCount] = useState({ done: 0, total: 0 });
    const [tooMany, setTooMany] = useState(false);
    const [progress, setProgress] = useState({ day: 0, days: 0, photo: 0, photos: 0, fraction: 0 });
    const [error, setError] = useState<MomentErrorCode | null>(null);
    const [errorDetail, setErrorDetail] = useState('');
    const [savedCount, setSavedCount] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const runId = useRef(0);
    const { status: driveStatus } = useDriveStatus(open);
    const driveReady = !driveStatus || (driveStatus.configured && driveStatus.connected);

    const releaseThumbs = (list: GroupDraft[]) => list.forEach((group) => group.days.forEach((day) => day.thumbs.forEach((url) => URL.revokeObjectURL(url))));

    useEffect(() => {
        if (!open) return undefined;
        runId.current += 1;
        setStep('pick');
        setGroups([]);
        setError(null);
        setTooMany(false);
        setSavedCount(0);
        return () => { runId.current += 1; };
    }, [open]);

    // Thumbnails are object URLs: free them when the list changes or the dialog closes.
    const groupsRef = useRef<GroupDraft[]>([]);
    useEffect(() => { groupsRef.current = groups; }, [groups]);
    useEffect(() => () => releaseThumbs(groupsRef.current), []);

    const updateGroup = (key: string, patch: Partial<GroupDraft>) =>
        setGroups((current) => current.map((group) => (group.key === key ? { ...group, ...patch } : group)));

    // Merges a group with the one below it (the older days) into one event.
    const mergeWithNext = (index: number) => setGroups((current) => {
        const [a, b] = [current[index], current[index + 1]];
        if (!a || !b) return current;
        const days = [...a.days, ...b.days];
        const merged: GroupDraft = {
            key: groupKey(days),
            days,
            selected: true,
            title: a.title || b.title,
            note: [a.note, b.note].filter(Boolean).join('\n'),
            pickedDate: a.pickedDate
        };
        return [...current.slice(0, index), merged, ...current.slice(index + 2)];
    });

    // A whole trip in one go: every entry becomes one event (photos beyond the cap are left out).
    const mergeAll = () => setGroups((current) => {
        if (current.length < 2) return current;
        const days = current.flatMap((group) => group.days);
        return [{
            key: groupKey(days),
            days,
            selected: true,
            title: current.map((group) => group.title).find(Boolean) || '',
            note: current.map((group) => group.note).filter(Boolean).join('\n'),
            pickedDate: current[0].pickedDate
        }];
    });

    const splitGroup = (index: number) => setGroups((current) => {
        const group = current[index];
        if (!group || group.days.length < 2) return current;
        const parts = group.days.map((day, i) => singleGroup(day, i === 0 ? { title: group.title, note: group.note } : {}));
        return [...current.slice(0, index), ...parts, ...current.slice(index + 1)];
    });

    const lookUpPlaces = async (list: DayDraft[], run: number) => {
        for (const day of list) {
            const { gps } = day;
            if (!gps) continue;
            const name = await reverseGeocode(gps.lat, gps.lng);
            if (runId.current !== run) return;
            if (name) {
                setGroups((current) => current.map((group) => ({
                    ...group,
                    days: group.days.map((item) => (item.id === day.id && !item.placeName ? { ...item, placeName: name } : item))
                })));
            }
            await wait(GEOCODE_GAP_MS);
        }
    };

    const handleFiles = async (fileList: FileList | File[] | null) => {
        const picked = Array.from(fileList || []).filter(isImageFile);
        if (inputRef.current) inputRef.current.value = '';
        if (!picked.length) return;
        const files = picked.slice(0, MAX_IMPORT_PHOTOS);
        setTooMany(picked.length > files.length);
        const run = ++runId.current;
        const startedAt = Date.now();
        setStep('reading');
        setReadCount({ done: 0, total: files.length });
        const photos = [];
        for (let i = 0; i < files.length; i += 1) {
            photos.push({ file: files[i], meta: await readPhotoMeta(files[i]) });
            if (i % 10 === 9) setReadCount({ done: i + 1, total: files.length });
            if (runId.current !== run) return;
        }
        releaseThumbs(groupsRef.current);
        const days: DayDraft[] = groupPhotosByDay(photos, startedAt).map((day) => ({
            ...day,
            placeName: '',
            thumbs: day.items.slice(0, THUMBS_PER_GROUP).map((item) => URL.createObjectURL(item.file))
        }));
        setGroups(days.map((day) => singleGroup(day)));
        setSavedCount(0);
        setStep('review');
        void lookUpPlaces(days, run);
    };

    // Opened with photos already chosen: go straight to reading them.
    useEffect(() => {
        if (open && initialFiles?.length) void handleFiles(initialFiles);
        // Only when the dialog opens with a new set of photos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialFiles]);

    const summaries = useMemo(() => new Map(groups.map((group) => [group.key, summarizeGroup(group.days, MAX_PHOTOS_PER_MOMENT)])), [groups]);
    const chosen = useMemo(() => groups.filter((group) => group.selected), [groups]);
    const chosenPhotos = chosen.reduce((sum, group) => sum + (summaries.get(group.key)?.photos.length || 0), 0);

    const handleImport = async () => {
        const run = runId.current;
        setStep('saving');
        setError(null);
        let saved = savedCount;
        for (let i = 0; i < chosen.length; i += 1) {
            const group = chosen[i];
            const summary = summaries.get(group.key)!;
            const placeName = group.days.find((day) => day.placeName)?.placeName || '';
            // Each photo keeps the place of the day part it came from.
            const nameOf = new Map(group.days.flatMap((day) => day.items.map((item) => [item.file, day.placeName] as const)));
            try {
                await saveMoment(uid, null, {
                    title: group.title,
                    date: summary.date || group.pickedDate || today(),
                    note: group.note.trim(),
                    keptPhotos: [],
                    newFiles: summary.photos,
                    newFileInfo: summary.items.map((item) => ({
                        place: item.gps ? { ...item.gps, name: nameOf.get(item.file) || '' } : null,
                        takenAt: item.stamp && item.source === 'exif' ? item.stamp : null
                    })),
                    location: summary.gps ? { ...summary.gps, name: placeName, source: 'photo' } : null
                }, (photo, photos, fraction) => setProgress({ day: i, days: chosen.length, photo, photos, fraction }));
            } catch (saveError) {
                if (runId.current !== run) return;
                const failure = toMomentError(saveError);
                console.error('Import failed', failure.code, failure.message);
                setError(failure.code);
                setErrorDetail(failure.code === 'failed' ? failure.message : '');
                setSavedCount(saved);
                // Keep only the events that are not saved yet, so trying again does not duplicate.
                const done = new Set(chosen.slice(0, i).map((item) => item.key));
                setGroups((current) => current.filter((item) => !done.has(item.key)));
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
                        {groups.length > 2 && step === 'review' && (
                            <Button fullWidth onClick={mergeAll}
                                sx={{ mb: 1.5, borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#be185d', bgcolor: '#fdf2f8', border: '1px solid #fbcfe8' }}>
                                {t('moments.import.mergeAll', { count: groups.length })}
                            </Button>
                        )}
                        {tooMany && <Alert severity="info" sx={{ mb: 1.5 }}>{t('moments.import.tooMany', { max: MAX_IMPORT_PHOTOS })}</Alert>}
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            {groups.map((group, index) => {
                                const summary = summaries.get(group.key)!;
                                const thumbs = group.days.flatMap((day) => day.thumbs).slice(0, THUMBS_PER_GROUP);
                                const placeName = [...new Set(group.days.map((day) => day.placeName).filter(Boolean))].join(' · ');
                                const datedDays = new Set(group.days.map((day) => day.date).filter(Boolean)).size;
                                const saving = step === 'saving';
                                return (
                                    <React.Fragment key={group.key}>
                                        <Box sx={{
                                            p: 1.25, borderRadius: '14px', border: '1px solid', borderColor: group.selected ? '#fbcfe8' : '#e5e7eb',
                                            bgcolor: group.selected ? '#fff' : '#f8fafc', opacity: group.selected ? 1 : 0.6
                                        }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Checkbox
                                                    checked={group.selected}
                                                    disabled={saving}
                                                    onChange={(event) => updateGroup(group.key, { selected: event.target.checked })}
                                                    inputProps={{ 'aria-label': summary.date ? formatMomentDate(summary.date) : t('moments.import.noDate') }}
                                                    sx={{ p: 0.5, color: '#ec4899', '&.Mui-checked': { color: '#ec4899' } }}
                                                />
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#101c22' }}>
                                                        {!summary.date
                                                            ? t('moments.import.noDate')
                                                            : summary.endDate !== summary.date
                                                                ? `${formatMomentDate(summary.date)} – ${formatMomentDate(summary.endDate)}`
                                                                : formatMomentDate(summary.date)}
                                                        <Box component="span" sx={{ fontWeight: 500, color: '#6b7f8a' }}>
                                                            {' · '}{t('moments.import.photoCount', { count: summary.photos.length + summary.skipped })}
                                                            {datedDays > 1 && ` · ${t('moments.import.dayCount', { count: datedDays })}`}
                                                        </Box>
                                                    </Typography>
                                                    {(placeName || summary.guessed > 0 || (summary.undated > 0 && summary.date) || summary.skipped > 0) && (
                                                        <Typography sx={{ fontSize: 12, color: '#9d174d' }}>
                                                            {[
                                                                placeName && `📍 ${placeName}`,
                                                                summary.guessed > 0 && t('moments.import.guessed', { count: summary.guessed }),
                                                                summary.undated > 0 && summary.date && t('moments.import.undatedJoined', { count: summary.undated }),
                                                                summary.skipped > 0 && t('moments.import.skipped', { count: summary.skipped, max: MAX_PHOTOS_PER_MOMENT })
                                                            ].filter(Boolean).join(' · ')}
                                                        </Typography>
                                                    )}
                                                </Box>
                                                {group.days.length > 1 && (
                                                    <Button size="small" disabled={saving} onClick={() => splitGroup(index)}
                                                        sx={{ textTransform: 'none', fontWeight: 600, color: '#6b7f8a', minWidth: 0, flex: '0 0 auto' }}>
                                                        {t('moments.import.split')}
                                                    </Button>
                                                )}
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 0.75, mt: 1, pl: 4.5 }}>
                                                {thumbs.map((url) => (
                                                    <Box key={url} component="img" src={url} alt="" sx={{ width: 48, height: 48, borderRadius: '8px', objectFit: 'cover', bgcolor: '#f1f5f9' }} />
                                                ))}
                                                {summary.photos.length > thumbs.length && (
                                                    <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: '#fdf2f8', color: '#be185d', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        +{summary.photos.length - thumbs.length}
                                                    </Box>
                                                )}
                                            </Box>
                                            {!summary.date && (
                                                <Typography sx={{ fontSize: 12, color: '#9d174d', mt: 1 }}>{t('moments.import.noDateHint')}</Typography>
                                            )}
                                            {group.selected && (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                                                    {!summary.date && (
                                                        <TextField
                                                            variant="filled"
                                                            size="small"
                                                            type="date"
                                                            disabled={saving}
                                                            label={t('moments.date')}
                                                            value={group.pickedDate}
                                                            onChange={(event) => updateGroup(group.key, { pickedDate: event.target.value })}
                                                            InputLabelProps={{ shrink: true }}
                                                            sx={fieldSx}
                                                        />
                                                    )}
                                                    <TextField
                                                        variant="filled"
                                                        size="small"
                                                        fullWidth
                                                        disabled={saving}
                                                        label={t('moments.import.nameLabel')}
                                                        placeholder={t('moments.namePlaceholder')}
                                                        value={group.title}
                                                        onChange={(event) => updateGroup(group.key, { title: event.target.value })}
                                                        inputProps={{ maxLength: 120 }}
                                                        sx={fieldSx}
                                                    />
                                                    <TextField
                                                        variant="filled"
                                                        size="small"
                                                        fullWidth
                                                        multiline
                                                        minRows={1}
                                                        maxRows={4}
                                                        disabled={saving}
                                                        label={t('moments.note')}
                                                        value={group.note}
                                                        onChange={(event) => updateGroup(group.key, { note: event.target.value })}
                                                        inputProps={{ maxLength: 2000 }}
                                                        sx={fieldSx}
                                                    />
                                                </Box>
                                            )}
                                        </Box>
                                        {index < groups.length - 1 && (
                                            <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.5 }}>
                                                <Button size="small" disabled={saving} onClick={() => mergeWithNext(index)}
                                                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, color: '#be185d', borderRadius: '10px', py: 0.25 }}>
                                                    {t('moments.import.merge')}
                                                </Button>
                                            </Box>
                                        )}
                                    </React.Fragment>
                                );
                            })}
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
            {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError(null)}>{t(momentErrorKey(error))}
                {errorDetail && <Box component="span" sx={{ display: 'block', fontSize: 12, opacity: 0.75, mt: 0.5, wordBreak: 'break-word' }}>{errorDetail}</Box>}
            </Alert>}

            {(step === 'review' || step === 'saving') && (
                <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                    <Button disabled={step === 'saving'} onClick={() => inputRef.current?.click()}
                        sx={{ flex: '0 0 auto', borderRadius: '14px', textTransform: 'none', fontWeight: 600, color: '#0369a1', bgcolor: '#f0f9ff' }}>
                        {t('moments.import.chooseAgain')}
                    </Button>
                    <Button fullWidth variant="contained" disabled={step === 'saving' || !chosen.length || !driveReady || chosen.some((group) => !summaries.get(group.key)?.date && !group.pickedDate)} onClick={() => void handleImport()}
                        sx={{ borderRadius: '14px', py: 1.25, textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}>
                        {step === 'saving' ? t('moments.saving') : t('moments.import.create', { count: chosen.length, photos: chosenPhotos })}
                    </Button>
                </Box>
            )}

            <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(event) => void handleFiles(event.target.files)} />
        </Dialog>
    );
};

export default MomentImportDialog;
