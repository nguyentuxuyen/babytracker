import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, InputAdornment, Snackbar, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { BackIcon as ArrowBackIosNewIcon, CloseIcon, SearchIcon } from '../components/common/icons';
import { useAuth } from '../contexts/AuthContext';
import { AppLanguage, SUPPORTED_LANGUAGES, currentLanguage } from '../i18n';
import { baseTranslations, getTranslationOverrides, saveTranslationOverrides, TranslationOverrides } from '../i18n/overrides';

const placeholdersOf = (text: string) => (text.match(/{{\s*[\w.]+\s*}}/g) || []).map((p) => p.replace(/\s/g, '')).sort().join('|');

const TranslationsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { currentUser } = useAuth();
    const [language, setLanguage] = useState<AppLanguage>(currentLanguage());
    const [drafts, setDrafts] = useState<TranslationOverrides>(() => JSON.parse(JSON.stringify(getTranslationOverrides())));
    const [search, setSearch] = useState('');
    const [editedOnly, setEditedOnly] = useState(false);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

    const base = useMemo(() => baseTranslations(language), [language]);
    const draft = drafts[language] || {};
    const valueOf = (key: string) => draft[key] ?? base[key];
    const isEdited = (key: string) => draft[key] !== undefined && draft[key] !== base[key];
    const hasPlaceholderError = (key: string) => placeholdersOf(valueOf(key)) !== placeholdersOf(base[key]);

    const keys = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return Object.keys(base).filter((key) => {
            if (editedOnly && !isEdited(key)) return false;
            if (!needle) return true;
            return [key, base[key], valueOf(key)].some((text) => text.toLowerCase().includes(needle));
        });
        // valueOf/isEdited read draft and base, which are both listed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base, draft, search, editedOnly]);

    const editedCount = Object.keys(base).filter(isEdited).length;
    const invalidKeys = Object.keys(base).filter(hasPlaceholderError);

    const setValue = (key: string, value: string) => {
        setDrafts((prev) => ({ ...prev, [language]: { ...(prev[language] || {}), [key]: value } }));
    };
    const resetValue = (key: string) => {
        setDrafts((prev) => {
            const next = { ...(prev[language] || {}) };
            delete next[key];
            return { ...prev, [language]: next };
        });
    };

    const handleSave = async () => {
        if (!currentUser?.uid || invalidKeys.length > 0) return;
        setSaving(true);
        try {
            await saveTranslationOverrides(currentUser.uid, drafts);
            setSnackbar({ severity: 'success', message: t('translations.saved') });
        } catch (error) {
            console.error('Failed to save translations:', error);
            setSnackbar({ severity: 'error', message: t('translations.saveFailed') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f8', pb: 12 }}>
            <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: '#ffffff', borderBottom: '1px solid #e5e7eb', px: 2, py: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <IconButton onClick={onBack} aria-label={t('common.back')}>
                        <ArrowBackIosNewIcon sx={{ fontSize: 18, color: '#6b7f8a' }} />
                    </IconButton>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#101c22' }}>{t('translations.title')}</Typography>
                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a' }}>{t('translations.subtitle')}</Typography>
                    </Box>
                </Box>
                <ToggleButtonGroup
                    value={language}
                    exclusive
                    size="small"
                    onChange={(_, value: AppLanguage | null) => value && setLanguage(value)}
                    sx={{ mb: 1.5 }}
                >
                    {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                        <ToggleButton key={code} value={code} lang={code} sx={{ textTransform: 'none', px: 1.5 }}>{label}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <TextField
                    fullWidth
                    size="small"
                    placeholder={t('translations.search')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#9ca3af' }} /></InputAdornment>,
                        sx: { bgcolor: '#ffffff' }
                    }}
                />
                <FormControlLabel
                    control={<Checkbox size="small" checked={editedOnly} onChange={(event) => setEditedOnly(event.target.checked)} />}
                    label={<Typography sx={{ fontSize: '13px' }}>{t('translations.editedOnly', { count: editedCount })}</Typography>}
                />
            </Box>

            <Box sx={{ px: 2, pt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {keys.length === 0 && (
                    <Typography sx={{ color: '#6b7f8a', textAlign: 'center', mt: 4 }}>{t('translations.noMatch')}</Typography>
                )}
                {keys.map((key) => {
                    const edited = isEdited(key);
                    const invalid = hasPlaceholderError(key);
                    return (
                        <Box key={key} sx={{ bgcolor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', p: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography sx={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{key}</Typography>
                                {edited && <Chip label={t('translations.edited')} size="small" color="primary" variant="outlined" />}
                                {edited && (
                                    <Tooltip title={t('translations.reset')}>
                                        <IconButton size="small" aria-label={t('translations.reset')} onClick={() => resetValue(key)}>
                                            <CloseIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                            <TextField
                                fullWidth
                                multiline
                                size="small"
                                value={valueOf(key)}
                                onChange={(event) => setValue(key, event.target.value)}
                                error={invalid}
                                helperText={invalid
                                    ? t('translations.placeholderError', { placeholders: placeholdersOf(base[key]).split('|').join(' ') })
                                    : edited ? t('translations.original', { text: base[key] }) : undefined}
                            />
                        </Box>
                    );
                })}
            </Box>

            <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, bgcolor: '#ffffff', borderTop: '1px solid #e5e7eb', p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', gap: 1.5 }}>
                <Button fullWidth variant="outlined" onClick={onBack} sx={{ textTransform: 'none' }}>{t('common.close')}</Button>
                <Button fullWidth variant="contained" onClick={() => void handleSave()} disabled={saving || invalidKeys.length > 0 || !currentUser} sx={{ textTransform: 'none' }}>
                    {saving ? t('translations.saving') : t('common.save')}
                </Button>
            </Box>

            <Snackbar open={Boolean(snackbar)} autoHideDuration={3000} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                {snackbar ? <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>{snackbar.message}</Alert> : undefined}
            </Snackbar>
        </Box>
    );
};

export default TranslationsPage;
