import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, IconButton, LinearProgress, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
    MAX_PHOTOS_PER_MOMENT,
    Moment,
    MomentErrorCode,
    mergeDefaults,
    mergeMoments,
    mergedPhotoCount,
    toMomentError
} from '../../firebase/moments';
import { SlideUp, bottomSheetProps, momentErrorKey } from './MomentEditorDialog';
import { formatMomentDate } from './MomentViewer';
import { fieldSx } from './FormControls';
import DrivePhoto from './DrivePhoto';

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    moments: Moment[];
    onMerged: (moment: Moment) => void;
}

// Confirms merging the chosen moments into one trip: shared name and note, every photo kept.
const MomentMergeDialog: React.FC<Props> = ({ open, onClose, uid, moments, onMerged }) => {
    const { t } = useTranslation();
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [error, setError] = useState<{ code: MomentErrorCode; detail: string } | null>(null);

    useEffect(() => {
        if (!open) return;
        const defaults = mergeDefaults(moments);
        setTitle(defaults.title);
        setNote(defaults.note);
        setError(null);
        setBusy(false);
        // Only when the dialog opens: live list updates must not wipe what the user typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const ordered = [...moments].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const photoCount = mergedPhotoCount(moments);
    const tooManyPhotos = photoCount > MAX_PHOTOS_PER_MOMENT;
    const first = ordered[0]?.date;
    const last = ordered[ordered.length - 1]?.date;

    const merge = async () => {
        setBusy(true);
        setError(null);
        try {
            const merged = await mergeMoments(uid, moments, { title, note }, (done, total) => setProgress({ done, total }));
            onMerged(merged);
        } catch (failure) {
            const momentError = toMomentError(failure);
            setError({ code: momentError.code, detail: momentError.code === 'failed' ? momentError.message : '' });
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} TransitionComponent={SlideUp} fullWidth {...bottomSheetProps}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
                <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#101c22' }}>
                    {t('moments.merge.title', { count: moments.length })}
                </Typography>
                <IconButton onClick={onClose} disabled={busy} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            <Box sx={{ px: 2, pb: 1, overflowY: 'auto' }}>
                <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1.5 }}>
                    {first && last && first !== last
                        ? t('moments.merge.range', { from: formatMomentDate(first), to: formatMomentDate(last), photos: photoCount })
                        : t('moments.merge.sameDay', { date: first ? formatMomentDate(first) : '', photos: photoCount })}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
                    {ordered.map((moment) => (
                        <Box key={moment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: '12px', bgcolor: '#fdf2f8' }}>
                            <Box sx={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: '10px', overflow: 'hidden', bgcolor: '#fce7f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {moment.photos[0]
                                    ? <DrivePhoto photo={moment.photos[0]} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                    : <span aria-hidden>✨</span>}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#101c22' }} noWrap>{moment.title || t('moments.untitled')}</Typography>
                                <Typography sx={{ fontSize: 12, color: '#6b7f8a' }}>
                                    {formatMomentDate(moment.date)} · {t('moments.merge.photoCount', { count: moment.photos.length })}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>

                {tooManyPhotos && (
                    <Alert severity="warning" sx={{ mb: 1.5 }}>
                        {t('moments.merge.tooManyPhotos', { count: photoCount, max: MAX_PHOTOS_PER_MOMENT })}
                    </Alert>
                )}

                <TextField
                    fullWidth
                    label={t('moments.name')}
                    placeholder={t('moments.namePlaceholder')}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={busy}
                    inputProps={{ maxLength: 120 }}
                    sx={{ ...fieldSx, mb: 1.5 }}
                />
                <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    label={t('moments.note')}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={busy}
                    sx={{ ...fieldSx, mb: 1.5 }}
                />

                <Typography sx={{ fontSize: 13, color: '#9a3412', bgcolor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', p: 1.25, mb: 1.5 }}>
                    {t('moments.merge.warning', { count: moments.length })}
                </Typography>

                {busy && (
                    <Box sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontSize: 13, color: '#475569', mb: 0.5 }}>
                            {progress.total ? t('moments.merge.moving', progress) : t('moments.saving')}
                        </Typography>
                        <LinearProgress
                            variant={progress.total ? 'determinate' : 'indeterminate'}
                            value={progress.total ? (progress.done / progress.total) * 100 : undefined}
                            sx={{ borderRadius: 3, height: 6 }}
                        />
                    </Box>
                )}
                {error && (
                    <Alert severity="error" sx={{ mb: 1.5 }}>
                        {t(momentErrorKey(error.code), { count: MAX_PHOTOS_PER_MOMENT })}
                        {error.detail ? ` (${error.detail})` : ''}
                    </Alert>
                )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <Button onClick={onClose} disabled={busy}
                    sx={{ flex: 1, borderRadius: '12px', textTransform: 'none', fontWeight: 700, color: '#475569', bgcolor: '#f1f5f9' }}>
                    {t('common.cancel')}
                </Button>
                <Button onClick={() => void merge()} disabled={busy || tooManyPhotos || moments.length < 2} variant="contained"
                    sx={{ flex: 2, borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#ec4899', '&:hover': { bgcolor: '#db2777' }, boxShadow: 'none' }}>
                    {t('moments.merge.confirm', { count: moments.length })}
                </Button>
            </Box>
        </Dialog>
    );
};

export default MomentMergeDialog;
