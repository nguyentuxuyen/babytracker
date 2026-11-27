import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getSpecialDay, SpecialDay } from '../../utils/specialDays';
import { useNotificationDay, useNotificationEntry } from './NotificationCenter';

type SpecialDayCelebrationProps = {
    baby: { name?: string; birthDate?: Date | null };
    now: Date;
    // Opens the moment editor for today, to keep a photo of the day.
    onAddMoment?: () => void;
};

// Day the celebration last popped up, shared by the account's devices so it shows once a day.
const SEEN_DAY = 'celebrationSeen';
const ACCENT = '#db2777';

const isoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysSince = (from: Date, to: Date) => {
    const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((end - start) / DAY_MS);
};

const prefersReducedMotion = () => {
    try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
        return false;
    }
};

const CONFETTI_COLORS = ['#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#a78bfa', '#fb7185', '#facc15'];
const CONFETTI_MS = 4500;

// Paper confetti falling over the whole screen for a few seconds; taps go through it.
const Confetti: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext?.('2d');
        if (!canvas || !context) return undefined;
        const ratio = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.scale(ratio, ratio);

        const pieces = Array.from({ length: 140 }, (_, index) => {
            // Two bursts from the lower corners, then the rest drifts down from the top.
            const fromLeft = index % 3 === 0;
            const burst = index % 3 !== 2;
            return {
                x: burst ? (fromLeft ? 0 : width) : Math.random() * width,
                y: burst ? height * 0.75 : -20 - Math.random() * height * 0.5,
                vx: burst ? (fromLeft ? 1 : -1) * (3 + Math.random() * 6) : (Math.random() - 0.5) * 1.5,
                vy: burst ? -(9 + Math.random() * 8) : 1 + Math.random() * 2,
                size: 6 + Math.random() * 6,
                rotation: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.3,
                color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                round: index % 5 === 0
            };
        });

        const started = performance.now();
        let frame = 0;
        const draw = (time: number) => {
            const elapsed = time - started;
            context.clearRect(0, 0, width, height);
            context.globalAlpha = Math.max(0, Math.min(1, (CONFETTI_MS - elapsed) / 800));
            pieces.forEach((piece) => {
                piece.vy = Math.min(piece.vy + 0.25, 4.5);
                piece.vx *= 0.985;
                piece.x += piece.vx + Math.sin((elapsed / 300) + piece.size) * 0.6;
                piece.y += piece.vy;
                piece.rotation += piece.spin;
                context.save();
                context.translate(piece.x, piece.y);
                context.rotate(piece.rotation);
                context.fillStyle = piece.color;
                if (piece.round) {
                    context.beginPath();
                    context.arc(0, 0, piece.size / 2.5, 0, Math.PI * 2);
                    context.fill();
                } else {
                    context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
                }
                context.restore();
            });
            if (elapsed < CONFETTI_MS) frame = window.requestAnimationFrame(draw);
            else context.clearRect(0, 0, width, height);
        };
        frame = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(frame);
    }, []);

    return ReactDOM.createPortal(
        <canvas
            ref={canvasRef}
            data-testid="celebration-confetti"
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 1400 }}
        />,
        document.body
    );
};

const useCelebrationText = (special: SpecialDay, name: string) => {
    const { t } = useTranslation();
    if (special.kind === 'birthday') {
        return {
            emoji: '🎂',
            title: special.years === 1
                ? t('celebration.firstBirthday', { name })
                : t('celebration.birthday', { name, n: special.years }),
            short: t('celebration.birthdayShort', { name, n: special.years })
        };
    }
    const { months } = special;
    const years = Math.floor(months / 12);
    return {
        emoji: '🎉',
        title: months === 1 ? t('celebration.firstMonth', { name }) : t('celebration.monthly', { name, n: months }),
        short: t('celebration.monthlyShort', { name, n: months }),
        // "16 tháng" also reads as "1 tuổi 4 tháng".
        age: years > 0 ? t('celebration.yearsMonths', { years, months: months % 12 }) : null
    };
};

const CelebrationContent: React.FC<SpecialDayCelebrationProps & { special: SpecialDay }> = ({ baby, now, onAddMoment, special }) => {
    const { t } = useTranslation();
    const name = baby.name?.trim() || t('celebration.babyFallback');
    const text = useCelebrationText(special, name);
    const today = isoDay(now);
    const [seenDay, setSeenDay, ready] = useNotificationDay(SEEN_DAY);
    const [open, setOpen] = useState(false);
    const [replay, setReplay] = useState(0);
    const reducedMotion = useMemo(prefersReducedMotion, []);
    const days = baby.birthDate ? daysSince(baby.birthDate, now) : null;

    // Pops up on the first opening of the day, on whichever device that is.
    useEffect(() => {
        if (ready && seenDay !== today) setOpen(true);
    }, [ready, seenDay, today]);

    // Listed in the header bell for the day so it can be watched again; no badge.
    useNotificationEntry('celebration', { visible: true, key: null });

    const close = () => {
        setOpen(false);
        if (seenDay !== today) setSeenDay(today);
    };

    const showAgain = () => {
        setReplay((count) => count + 1);
        setOpen(true);
    };

    return (
        <>
            <Box
                role="button"
                tabIndex={0}
                onClick={showAgain}
                onKeyDown={(event) => { if (event.key === 'Enter') showAgain(); }}
                sx={{ mb: 1.5, p: 1.5, borderRadius: '16px', bgcolor: '#fdf2f8', border: '1px solid #fbcfe8', display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
            >
                <Typography component="span" sx={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{text.emoji}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#831843' }}>{text.short}</Typography>
                <Button size="small" sx={{ color: ACCENT, fontWeight: 700, textTransform: 'none', flexShrink: 0 }}>
                    {t('celebration.replay')}
                </Button>
            </Box>
            {open && !reducedMotion && <Confetti key={replay} />}
            <Dialog
                open={open}
                onClose={close}
                fullWidth
                maxWidth="xs"
                PaperProps={{
                    sx: {
                        borderRadius: '28px',
                        m: 2,
                        width: 'calc(100% - 32px)',
                        background: 'linear-gradient(180deg, #fff1f7 0%, #ffffff 60%)',
                        textAlign: 'center',
                        overflow: 'visible'
                    }
                }}
            >
                <DialogContent sx={{ pt: 3, pb: 1 }}>
                    <Box
                        aria-hidden="true"
                        sx={{
                            fontSize: 64,
                            lineHeight: 1,
                            mb: 1.5,
                            '@keyframes celebrationPop': {
                                '0%': { transform: 'scale(0.3) rotate(-15deg)', opacity: 0 },
                                '60%': { transform: 'scale(1.15) rotate(6deg)', opacity: 1 },
                                '100%': { transform: 'scale(1) rotate(0deg)' }
                            },
                            animation: reducedMotion ? 'none' : 'celebrationPop 700ms ease-out'
                        }}
                    >
                        {text.emoji}
                    </Box>
                    <Typography component="h2" sx={{ fontSize: 22, fontWeight: 800, color: '#831843', lineHeight: 1.3 }}>
                        {text.title}
                    </Typography>
                    {text.age && (
                        <Typography sx={{ mt: 0.5, fontSize: 14, fontWeight: 600, color: ACCENT }}>{text.age}</Typography>
                    )}
                    {days !== null && days > 0 && (
                        <Typography sx={{ mt: 1.5, fontSize: 14, color: '#475569' }}>
                            {t('celebration.days', { name, n: days.toLocaleString() })}
                        </Typography>
                    )}
                    <Typography sx={{ mt: 1, fontSize: 14, color: '#475569' }}>{t('celebration.wish')}</Typography>
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', gap: 1, px: 3, pb: 3 }}>
                    {onAddMoment && (
                        <Button
                            fullWidth
                            variant="contained"
                            onClick={() => { close(); onAddMoment(); }}
                            sx={{ bgcolor: ACCENT, '&:hover': { bgcolor: '#be185d' }, textTransform: 'none', fontWeight: 700, borderRadius: '14px', py: 1.1 }}
                        >
                            {t('celebration.addMoment')}
                        </Button>
                    )}
                    <Button fullWidth onClick={close} sx={{ color: ACCENT, textTransform: 'none', fontWeight: 700, m: '0 !important' }}>
                        {t('celebration.close')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

// On the baby's day of birth each month ("tròn N tháng") and on the birthday, the first
// opening of the app that day shows confetti and a wish; the bell keeps a row to see it again.
const SpecialDayCelebration: React.FC<SpecialDayCelebrationProps> = (props) => {
    const { baby, now } = props;
    const birth = baby.birthDate instanceof Date ? baby.birthDate : null;
    const special = useMemo(() => getSpecialDay(birth, now), [birth?.getTime(), isoDay(now)]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!special) return null;
    return <CelebrationContent {...props} special={special} />;
};

export default SpecialDayCelebration;
