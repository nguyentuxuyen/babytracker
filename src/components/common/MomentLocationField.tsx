import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { MomentLocation } from '../../firebase/moments';
import { PlaceResult, searchPlaces } from '../../services/geocode';
import { fieldSx } from './FormControls';

interface Props {
    value: MomentLocation | null;
    onChange: (value: MomentLocation | null) => void;
    /** True while the name of a position read from a photo is being looked up. */
    resolving?: boolean;
    disabled?: boolean;
    /** Text of the button shown while there is no place (default: "add a place"). */
    addLabel?: string;
}

const PinIcon: React.FC<{ color?: string }> = ({ color = '#ec4899' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="12" cy="9.5" r="2.5" stroke={color} strokeWidth="2" />
    </svg>
);

// Place of a moment: filled from the photos' GPS when there is one; the name can be
// edited, and the place changed by searching or removed.
const MomentLocationField: React.FC<Props> = ({ value, onChange, resolving = false, disabled = false, addLabel }) => {
    const { t } = useTranslation();
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PlaceResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const runSearch = async () => {
        const text = query.trim();
        if (text.length < 2) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setFailed(false);
        try {
            setResults(await searchPlaces(text, controller.signal));
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') setFailed(true);
        } finally {
            if (abortRef.current === controller) setLoading(false);
        }
    };

    const closeSearch = () => {
        abortRef.current?.abort();
        setSearching(false);
        setQuery('');
        setResults(null);
        setFailed(false);
        setLoading(false);
    };

    if (searching) {
        return (
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                        variant="filled"
                        size="small"
                        fullWidth
                        autoFocus
                        label={t('moments.location.searchLabel')}
                        placeholder={t('moments.location.searchPlaceholder')}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void runSearch();
                            }
                        }}
                        inputProps={{ maxLength: 120, enterKeyHint: 'search' }}
                        sx={fieldSx}
                    />
                    <Button
                        variant="contained"
                        disabled={loading || query.trim().length < 2}
                        onClick={() => void runSearch()}
                        sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: '#13a4ec', flex: '0 0 auto' }}
                    >
                        {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : t('moments.location.search')}
                    </Button>
                </Box>
                {failed && <Typography sx={{ fontSize: 13, color: '#dc2626', mt: 1 }}>{t('moments.location.searchFailed')}</Typography>}
                {results && results.length === 0 && <Typography sx={{ fontSize: 13, color: '#6b7f8a', mt: 1 }}>{t('moments.location.noResults')}</Typography>}
                {results && results.length > 0 && (
                    <Box sx={{ mt: 1, border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                        {results.map((place) => (
                            <Box
                                key={`${place.lat},${place.lng}`}
                                component="button"
                                type="button"
                                onClick={() => {
                                    onChange({ lat: place.lat, lng: place.lng, name: place.name, source: 'search' });
                                    closeSearch();
                                }}
                                sx={{
                                    display: 'flex', gap: 1, alignItems: 'center', width: '100%', px: 1.5, py: 1.1,
                                    border: 0, borderBottom: '1px solid #f1f5f9', bgcolor: '#fff', textAlign: 'left',
                                    fontFamily: 'inherit', fontSize: 14, color: '#101c22', cursor: 'pointer',
                                    '&:last-of-type': { borderBottom: 0 }, '&:hover': { bgcolor: '#f8fafc' }
                                }}
                            >
                                <PinIcon color="#94a3b8" />
                                <span>{place.name}</span>
                            </Box>
                        ))}
                    </Box>
                )}
                <Button onClick={closeSearch} sx={{ mt: 0.5, textTransform: 'none', color: '#6b7f8a' }}>{t('common.cancel')}</Button>
            </Box>
        );
    }

    if (!value) {
        return (
            <Button
                disabled={disabled}
                onClick={() => setSearching(true)}
                startIcon={<PinIcon color="#13a4ec" />}
                sx={{ mb: 2, textTransform: 'none', fontWeight: 700, color: '#0369a1', bgcolor: '#f0f9ff', borderRadius: '12px', px: 1.5 }}
            >
                {addLabel || t('moments.location.add')}
            </Button>
        );
    }

    return (
        <Box sx={{ mb: 2, p: 1.25, borderRadius: '14px', bgcolor: '#fdf2f8', border: '1px solid #fbcfe8' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PinIcon />
                <TextField
                    variant="standard"
                    fullWidth
                    disabled={disabled}
                    value={value.name}
                    placeholder={resolving ? t('moments.location.resolving') : t('moments.location.namePlaceholder')}
                    onChange={(event) => onChange({ ...value, name: event.target.value })}
                    inputProps={{ maxLength: 120, 'aria-label': t('moments.location.nameLabel') }}
                    InputProps={{ disableUnderline: false, sx: { fontSize: 15, fontWeight: 600 } }}
                />
                {resolving && <CircularProgress size={16} sx={{ color: '#ec4899' }} />}
                <IconButton size="small" disabled={disabled} onClick={() => onChange(null)} aria-label={t('moments.location.remove')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#6b7f8a" strokeWidth="2" strokeLinecap="round" /></svg>
                </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, pl: 3.25 }}>
                <Typography sx={{ flex: 1, fontSize: 12, color: '#9d174d' }}>
                    {value.source === 'photo' ? t('moments.location.fromPhoto') : t('moments.location.picked')}
                </Typography>
                <Button size="small" disabled={disabled} onClick={() => setSearching(true)} sx={{ textTransform: 'none', fontWeight: 700, color: '#be185d', minWidth: 0 }}>
                    {t('moments.location.change')}
                </Button>
            </Box>
        </Box>
    );
};

export default MomentLocationField;
