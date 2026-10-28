import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, IconButton, LinearProgress, Slide, Typography } from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { useTranslation } from 'react-i18next';
import {
    MAX_PHOTOS_PER_PICK,
    MilestonePhoto,
    MilestonePhotoErrorCode,
    deleteMilestonePhoto,
    toPhotoError,
    uploadMilestonePhoto
} from '../../firebase/milestonePhotos';

const SlideUp = React.forwardRef(function SlideUp(
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const SWIPE_THRESHOLD_PX = 50;

interface Props {
    open: boolean;
    onClose: () => void;
    uid: string;
    milestoneId: string;
    title: string;
    photos: MilestonePhoto[];
}

const MilestonePhotosSheet: React.FC<Props> = ({ open, onClose, uid, milestoneId, title, photos }) => {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const [upload, setUpload] = useState<{ done: number; total: number; fraction: number } | null>(null);
    const [error, setError] = useState<MilestonePhotoErrorCode | 'too-many' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const touchStartX = useRef<number | null>(null);
    const previousCount = useRef(photos.length);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setConfirmDelete(false);
        setIndex(Math.max(0, photos.length - 1));
        // Only when the sheet opens; later changes are handled below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, milestoneId]);

    useEffect(() => {
        // Jump to the newest photo after an upload, stay in range after a delete.
        if (photos.length > previousCount.current) setIndex(photos.length - 1);
        else setIndex((current) => Math.min(current, Math.max(0, photos.length - 1)));
        previousCount.current = photos.length;
    }, [photos.length]);

    const current = photos[index];
    const go = (step: number) => {
        if (!photos.length) return;
        setConfirmDelete(false);
        setIndex((value) => (value + step + photos.length) % photos.length);
    };

    const handleFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList || []);
        if (inputRef.current) inputRef.current.value = '';
        if (!files.length) return;
        setError(files.length > MAX_PHOTOS_PER_PICK ? 'too-many' : null);
        const picked = files.slice(0, MAX_PHOTOS_PER_PICK);

        setUpload({ done: 0, total: picked.length, fraction: 0 });
        for (let i = 0; i < picked.length; i += 1) {
            try {
                await uploadMilestonePhoto(uid, milestoneId, picked[i], (fraction) =>
                    setUpload({ done: i, total: picked.length, fraction }));
            } catch (uploadError) {
                const code = toPhotoError(uploadError).code;
                setError(code);
                if (code === 'storage-disabled') break;
            }
        }
        setUpload(null);
    };

    const handleDelete = async () => {
        if (!current) return;
        setConfirmDelete(false);
        try {
            await deleteMilestonePhoto(uid, current);
        } catch {
            setError('failed');
        }
    };

    const uploading = upload !== null;
    const progress = upload ? ((upload.done + upload.fraction) / upload.total) * 100 : 0;

    return (
        <Dialog
            open={open}
            onClose={uploading ? undefined : onClose}
            TransitionComponent={SlideUp}
            fullWidth
            sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
            PaperProps={{
                sx: {
                    m: 0,
                    width: '100%',
                    maxWidth: 560,
                    maxHeight: '92vh',
                    borderRadius: '24px 24px 0 0',
                    overflow: 'hidden'
                }
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#101c22' }} noWrap>{title}</Typography>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>
                        {photos.length ? t('milestones.photos.count', { count: photos.length }) : t('milestones.photos.empty')}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} disabled={uploading} aria-label={t('common.close')}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>

            {current ? (
                <Box
                    sx={{ position: 'relative', bgcolor: '#0f172a', aspectRatio: '1 / 1', maxHeight: '55vh', width: '100%', userSelect: 'none' }}
                    onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
                    onTouchEnd={(event) => {
                        if (touchStartX.current === null) return;
                        const delta = event.changedTouches[0].clientX - touchStartX.current;
                        touchStartX.current = null;
                        if (Math.abs(delta) > SWIPE_THRESHOLD_PX) go(delta < 0 ? 1 : -1);
                    }}
                >
                    <Box
                        key={current.id}
                        component="img"
                        src={current.url}
                        alt={t('milestones.photos.photoAlt', { index: index + 1 })}
                        sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            display: 'block',
                            animation: 'milestonePhotoIn 0.25s ease-out',
                            '@keyframes milestonePhotoIn': { from: { opacity: 0 }, to: { opacity: 1 } }
                        }}
                    />
                    {photos.length > 1 && (
                        <>
                            {[-1, 1].map((step) => (
                                <IconButton
                                    key={step}
                                    onClick={() => go(step)}
                                    aria-label={step < 0 ? t('milestones.photos.previous') : t('milestones.photos.next')}
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
                    <Button
                        size="small"
                        onClick={() => (confirmDelete ? handleDelete() : setConfirmDelete(true))}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: '12px',
                            color: '#fff',
                            bgcolor: confirmDelete ? '#dc2626' : 'rgba(15,23,42,0.6)',
                            '&:hover': { bgcolor: confirmDelete ? '#b91c1c' : 'rgba(15,23,42,0.8)' }
                        }}
                    >
                        {confirmDelete ? t('milestones.photos.confirmDelete') : t('milestones.photos.delete')}
                    </Button>
                </Box>
            ) : (
                <Box
                    onClick={() => !uploading && inputRef.current?.click()}
                    sx={{
                        mx: 2,
                        py: 5,
                        border: '2px dashed #cbd5e1',
                        borderRadius: '16px',
                        textAlign: 'center',
                        color: '#6b7f8a',
                        cursor: 'pointer'
                    }}
                >
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#101c22' }}>{t('milestones.photos.addFirst')}</Typography>
                    <Typography sx={{ fontSize: 13, mt: 0.5 }}>{t('milestones.photos.limit', { count: MAX_PHOTOS_PER_PICK })}</Typography>
                </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, overflowX: 'auto' }}>
                {photos.map((photo, photoIndex) => (
                    <Box
                        key={photo.id}
                        component="button"
                        type="button"
                        onClick={() => { setConfirmDelete(false); setIndex(photoIndex); }}
                        aria-label={t('milestones.photos.photoAlt', { index: photoIndex + 1 })}
                        sx={{
                            flex: '0 0 auto',
                            width: 56,
                            height: 56,
                            p: 0,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: photoIndex === index ? '3px solid #13a4ec' : '3px solid transparent',
                            bgcolor: '#f1f5f9'
                        }}
                    >
                        <Box component="img" src={photo.url} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </Box>
                ))}
                <Box
                    component="button"
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    aria-label={t('milestones.photos.add')}
                    sx={{
                        flex: '0 0 auto',
                        width: 56,
                        height: 56,
                        borderRadius: '12px',
                        border: '2px dashed #93c5fd',
                        bgcolor: '#f0f9ff',
                        color: '#13a4ec',
                        fontSize: 26,
                        lineHeight: 1,
                        cursor: 'pointer'
                    }}
                >
                    +
                </Box>
            </Box>

            {uploading && (
                <Box sx={{ px: 2, pb: 1 }}>
                    <Typography sx={{ fontSize: 13, color: '#475569', mb: 0.5 }}>
                        {t('milestones.photos.uploading', { done: upload.done + 1, total: upload.total })}
                    </Typography>
                    <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 3, height: 6 }} />
                </Box>
            )}

            {error && (
                <Alert severity={error === 'too-many' ? 'info' : 'error'} sx={{ mx: 2, mb: 1 }} onClose={() => setError(null)}>
                    {error === 'too-many'
                        ? t('milestones.photos.errors.tooMany', { count: MAX_PHOTOS_PER_PICK })
                        : t(`milestones.photos.errors.${error === 'storage-disabled' ? 'storageDisabled' : error === 'not-image' ? 'notImage' : error === 'too-large' ? 'tooLarge' : 'failed'}`)}
                </Alert>
            )}

            <Box sx={{ px: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
                <Button
                    fullWidth
                    variant="contained"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    sx={{ borderRadius: '14px', py: 1.25, textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}
                >
                    {t('milestones.photos.add')}
                </Button>
            </Box>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => handleFiles(event.target.files)}
            />
        </Dialog>
    );
};

export default MilestonePhotosSheet;
