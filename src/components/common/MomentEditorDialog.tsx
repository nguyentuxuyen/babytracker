import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, IconButton, LinearProgress, Slide, TextField, Typography } from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { useTranslation } from 'react-i18next';
import { fieldSx, SectionLabel } from './FormControls';
import {
    MAX_PHOTOS_PER_MOMENT,
    MAX_PHOTOS_PER_PICK,
    Moment,
    MomentErrorCode,
    MomentLocation,
    MomentPhoto,
    saveMoment,
    toLocalDateKey,
    toMomentError
} from '../../firebase/moments';
import { connectDrive } from '../../firebase/googleDrive';
import { useDriveStatus } from '../../hooks/useDriveStatus';
import DrivePhoto from './DrivePhoto';
import MomentLocationField from './MomentLocationField';
import { readPhotoMeta } from '../../utils/photoExif';
import { reverseGeocode } from '../../services/geocode';

export const SlideUp = React.forwardRef(function SlideUp(
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export const bottomSheetProps = {
    sx: { '& .MuiDialog-container': { alignItems: 'flex-end' } },
    PaperProps: {
        sx: { m: 0, width: '100%', maxWidth: 560, maxHeight: '94vh', borderRadius: '24px 24px 0 0' }
    }
} as const;

export const momentErrorKey = (code: MomentErrorCode | 'too-many') => ({
    'drive-not-connected': 'moments.errors.driveNotConnected',
    'drive-not-configured': 'moments.errors.driveNotConfigured',
    'not-image': 'moments.errors.notImage',
    'too-large': 'moments.errors.tooLarge',
    failed: 'moments.errors.failed',
    'too-many': 'moments.errors.tooMany'
} as const)[code];

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    moment?: Moment | null;
    defaultDate?: Date;
    onSaved?: (moment: Moment) => void;
}

const MomentEditorDialog: React.FC<Props> = ({ open, onClose, uid, moment, defaultDate, onSaved }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [note, setNote] = useState('');
    const [keptPhotos, setKeptPhotos] = useState<MomentPhoto[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [progress, setProgress] = useState<{ done: number; total: number; fraction: number } | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<MomentErrorCode | 'too-many' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { status: driveStatus } = useDriveStatus(open);
    // Unknown (still loading or offline) counts as usable; the save reports a real problem.
    const driveReady = !driveStatus || (driveStatus.configured && driveStatus.connected);
    const [connecting, setConnecting] = useState(false);
    const [location, setLocation] = useState<MomentLocation | null>(null);
    const [resolvingPlace, setResolvingPlace] = useState(false);
    // Once the user sets or removes the place, photos added later do not overwrite it.
    const locationTouched = useRef(false);
    // A new moment takes the day its photos were taken, until the user picks a date.
    const dateTouched = useRef(false);
    const changeLocation = (value: MomentLocation | null) => {
        locationTouched.current = true;
        setLocation(value);
    };

    useEffect(() => {
        if (!open) return;
        setTitle(moment?.title || '');
        setDate(moment?.date || toLocalDateKey(defaultDate || new Date()));
        setNote(moment?.note || '');
        setKeptPhotos(moment?.photos || []);
        setNewFiles([]);
        setLocation(moment?.location || null);
        dateTouched.current = Boolean(moment || defaultDate);
        locationTouched.current = Boolean(moment?.location);
        setResolvingPlace(false);
        setError(null);
        setProgress(null);
        // Reset only when the dialog opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, moment?.id]);

    const previews = useMemo(() => newFiles.map((file) => URL.createObjectURL(file)), [newFiles]);
    useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

    const photoCount = keptPhotos.length + newFiles.length;
    const canSave = !saving && (title.trim().length > 0 || photoCount > 0) && /^\d{4}-\d{2}-\d{2}$/.test(date);

    const addFiles = (fileList: FileList | null) => {
        const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
        if (inputRef.current) inputRef.current.value = '';
        if (!files.length) return;
        const room = Math.min(MAX_PHOTOS_PER_PICK, MAX_PHOTOS_PER_MOMENT - photoCount);
        setError(files.length > room ? 'too-many' : null);
        if (room > 0) setNewFiles((current) => [...current, ...files.slice(0, room)]);
        if (room > 0) void fillFromPhotos(files.slice(0, room));
    };

    const fillFromPhotos = async (files: File[]) => {
        const metas = await Promise.all(files.map((file) => readPhotoMeta(file)));
        const days = metas.map((meta) => meta.takenAt?.slice(0, 10)).filter((day): day is string => Boolean(day)).sort();
        if (days.length && !dateTouched.current) setDate(days[0]);
        if (!location && !locationTouched.current) await fillLocation(metas.map((meta) => meta.gps));
    };

    // The first photo carrying GPS gives the moment its place; its name is looked up after.
    const fillLocation = async (points: Array<{ lat: number; lng: number } | null>) => {
        for (const point of points) {
            if (!point) continue;
            if (locationTouched.current) return;
            const fromPhoto: MomentLocation = { ...point, name: '', source: 'photo' };
            setLocation(fromPhoto);
            setResolvingPlace(true);
            const name = await reverseGeocode(point.lat, point.lng);
            setResolvingPlace(false);
            if (name) {
                setLocation((current) => (current && current.lat === point.lat && current.lng === point.lng && !current.name ? { ...current, name } : current));
            }
            return;
        }
    };

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        try {
            const saved = await saveMoment(uid, moment || null, { title, date, note, keptPhotos, newFiles, location },
                (done, total, fraction) => setProgress({ done, total, fraction }));
            onSaved?.(saved);
            onClose();
        } catch (saveError) {
            setError(toMomentError(saveError).code);
        } finally {
            setSaving(false);
            setProgress(null);
        }
    };

    const tileSx = { position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: '12px', overflow: 'hidden', bgcolor: '#f1f5f9' } as const;
    const removeSx = {
        position: 'absolute', top: 4, right: 4, width: 26, height: 26, p: 0,
        bgcolor: 'rgba(15,23,42,0.65)', color: '#fff', '&:hover': { bgcolor: 'rgba(15,23,42,0.85)' }
    } as const;

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
                <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#101c22' }}>
                    {moment ? t('moments.editTitle') : t('moments.addTitle')}
                </Typography>
                <IconButton onClick={onClose} disabled={saving} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            <Box sx={{ px: 2, pb: 1, overflowY: 'auto' }}>
                <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 2 }}>{t('moments.hint')}</Typography>
                <TextField
                    variant="filled"
                    fullWidth
                    label={t('moments.name')}
                    placeholder={t('moments.namePlaceholder')}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    inputProps={{ maxLength: 120 }}
                    sx={{ ...fieldSx, mb: 1.5 }}
                />
                <TextField
                    variant="filled"
                    fullWidth
                    type="date"
                    label={t('moments.date')}
                    value={date}
                    onChange={(event) => {
                        dateTouched.current = true;
                        setDate(event.target.value);
                    }}
                    InputLabelProps={{ shrink: true }}
                    sx={{ ...fieldSx, mb: 1.5 }}
                />
                <MomentLocationField value={location} onChange={changeLocation} resolving={resolvingPlace} disabled={saving} />

                <SectionLabel>{t('moments.photos', { count: photoCount, max: MAX_PHOTOS_PER_MOMENT })}</SectionLabel>
                {!driveReady && driveStatus && (
                    <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '14px', bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <Typography sx={{ fontSize: 13, color: '#1e3a8a', mb: driveStatus.configured ? 1 : 0 }}>
                            {driveStatus.configured ? t('moments.drive.needConnect') : t('moments.errors.driveNotConfigured')}
                        </Typography>
                        {driveStatus.configured && (
                            <Button
                                size="small"
                                variant="contained"
                                disabled={connecting || saving}
                                onClick={() => {
                                    setConnecting(true);
                                    connectDrive().catch(() => { setConnecting(false); setError('failed'); });
                                }}
                                sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}
                            >
                                {t('moments.drive.connect')}
                            </Button>
                        )}
                    </Box>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
                    {keptPhotos.map((photo) => (
                        <Box key={photo.id} sx={tileSx}>
                            <DrivePhoto photo={photo} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            <IconButton size="small" disabled={saving} sx={removeSx} aria-label={t('moments.removePhoto')}
                                onClick={() => setKeptPhotos((current) => current.filter((item) => item.id !== photo.id))}>×</IconButton>
                        </Box>
                    ))}
                    {newFiles.map((file, index) => (
                        <Box key={`${file.name}-${index}`} sx={tileSx}>
                            <Box component="img" src={previews[index]} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            <IconButton size="small" disabled={saving} sx={removeSx} aria-label={t('moments.removePhoto')}
                                onClick={() => setNewFiles((current) => current.filter((_, i) => i !== index))}>×</IconButton>
                        </Box>
                    ))}
                    {photoCount < MAX_PHOTOS_PER_MOMENT && driveReady && (
                        <Box
                            component="button"
                            type="button"
                            disabled={saving}
                            onClick={() => inputRef.current?.click()}
                            aria-label={t('moments.addPhotos')}
                            sx={{
                                ...tileSx,
                                border: '2px dashed #93c5fd',
                                bgcolor: '#f0f9ff',
                                color: '#13a4ec',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.25,
                                fontFamily: 'inherit'
                            }}
                        >
                            <Box component="span" sx={{ fontSize: 26, lineHeight: 1 }}>+</Box>
                            <Box component="span" sx={{ fontSize: 11, fontWeight: 600 }}>{t('moments.addPhotosShort')}</Box>
                        </Box>
                    )}
                </Box>

                <TextField
                    variant="filled"
                    fullWidth
                    multiline
                    minRows={3}
                    label={t('moments.note')}
                    placeholder={t('moments.notePlaceholder')}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    inputProps={{ maxLength: 3000 }}
                    sx={{ ...fieldSx, mb: 1 }}
                />
            </Box>

            {progress && (
                <Box sx={{ px: 2, pb: 1 }}>
                    <Typography sx={{ fontSize: 13, color: '#475569', mb: 0.5 }}>
                        {t('moments.uploading', { done: progress.done + 1, total: progress.total })}
                    </Typography>
                    <LinearProgress variant="determinate" value={((progress.done + progress.fraction) / progress.total) * 100} sx={{ borderRadius: 3, height: 6 }} />
                </Box>
            )}
            {error && (
                <Alert severity={error === 'too-many' ? 'info' : 'error'} sx={{ mx: 2, mb: 1 }} onClose={() => setError(null)}>
                    {t(momentErrorKey(error), { count: MAX_PHOTOS_PER_PICK })}
                </Alert>
            )}

            <Box sx={{ px: 2, pt: 1, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <Button
                    fullWidth
                    variant="contained"
                    disabled={!canSave}
                    onClick={handleSave}
                    sx={{ borderRadius: '14px', py: 1.25, textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}
                >
                    {saving ? t('moments.saving') : t('common.save')}
                </Button>
            </Box>

            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => addFiles(event.target.files)} />
        </Dialog>
    );
};

export default MomentEditorDialog;
