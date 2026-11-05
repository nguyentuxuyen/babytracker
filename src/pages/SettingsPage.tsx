import React from 'react';
import { Box, Button, Switch, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '../contexts/SettingsContext';
import { MAX_MILK_PRODUCT_LENGTH } from '../utils/feedingSettings';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { ChoiceChips, fieldSx } from '../components/common/FormControls';
import { ACTIVITY_COLORS } from '../components/common/activityDisplay';
import { NotificationsIcon, SendIcon, TranslateIcon } from '../components/common/icons';
import { TextField } from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import { useDriveStatus } from '../hooks/useDriveStatus';
import { connectDrive, disconnectDrive, driveFolderUrl } from '../firebase/googleDrive';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box sx={{ p: 2, mb: 1.5, borderRadius: '16px', bgcolor: '#ffffff', border: '1px solid #e5e7eb' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#101c22', mb: 1.25 }}>{title}</Typography>
        {children}
    </Box>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569', mb: 0.75 }}>{children}</Typography>
);

// Where moment photos go: the user's own Google Drive, connected once.
const DriveSection: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { status, loading } = useDriveStatus(Boolean(user));
    const [busy, setBusy] = React.useState(false);
    const [confirm, setConfirm] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setFailed(false);
        try {
            await action();
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
            setConfirm(false);
        }
    };

    const text = !status
        ? (loading ? t('settingsPage.drive.loading') : t('settingsPage.drive.error'))
        : !status.configured
            ? t('settingsPage.drive.notConfigured')
            : status.connected ? t('settingsPage.drive.connected') : t('settingsPage.drive.notConnected');
    const buttonSx = { textTransform: 'none', fontWeight: 700, borderRadius: '10px' } as const;

    return (
        <Section title={t('settingsPage.drive.section')}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box
                    component="span"
                    aria-hidden
                    sx={{ mt: '5px', width: 10, height: 10, flex: '0 0 auto', borderRadius: '50%', bgcolor: status?.connected ? '#10b981' : '#cbd5e1' }}
                />
                <Typography sx={{ fontSize: 13, color: '#334155' }}>{text}</Typography>
            </Box>
            {failed && <Typography sx={{ fontSize: 12, color: '#dc2626', mt: 1 }}>{t('settingsPage.drive.error')}</Typography>}
            {status?.configured && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                    {status.connected ? (
                        <>
                            {status.folderId && (
                                <Button href={driveFolderUrl(status.folderId)} target="_blank" rel="noopener noreferrer" sx={{ ...buttonSx, color: '#0f766e', bgcolor: '#e6fffa' }}>
                                    {t('settingsPage.drive.openFolder')}
                                </Button>
                            )}
                            <Button
                                disabled={busy}
                                onClick={() => (confirm ? run(disconnectDrive) : setConfirm(true))}
                                sx={{ ...buttonSx, color: confirm ? '#fff' : '#dc2626', bgcolor: confirm ? '#dc2626' : '#fef2f2', '&:hover': { bgcolor: confirm ? '#b91c1c' : '#fee2e2' } }}
                            >
                                {confirm ? t('settingsPage.drive.confirmDisconnect') : t('settingsPage.drive.disconnect')}
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="contained"
                            disabled={busy}
                            onClick={() => run(() => connectDrive('/settings'))}
                            sx={{ ...buttonSx, bgcolor: '#13a4ec', '&:hover': { bgcolor: '#0e8fd9' } }}
                        >
                            {t('moments.drive.connect')}
                        </Button>
                    )}
                </Box>
            )}
        </Section>
    );
};

// Settings that used to crowd the account menu: reminders, the baby's milk, language.
const SettingsPage: React.FC = () => {
    const { t } = useTranslation();
    const settings = useAppSettings();
    if (!settings) return null;
    const { feedingSettings, onChangeFeedingSettings } = settings;

    return (
        <Box sx={{ px: 2, pt: 2, maxWidth: 720, mx: 'auto' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#101c22', mb: 2 }}>{t('settingsPage.title')}</Typography>

            <Section title={t('settingsPage.milk')}>
                <Label>{t('menu.defaultMilkType')}</Label>
                <ChoiceChips
                    color={ACTIVITY_COLORS.feeding}
                    selected={[feedingSettings.defaultMilkType ?? 'none']}
                    onToggle={(value) => onChangeFeedingSettings({ ...feedingSettings, defaultMilkType: value === 'none' ? null : value })}
                    options={[
                        { value: 'none' as const, label: t('menu.defaultMilkTypeNone') },
                        { value: 'formula' as const, label: t('feeding.milkType.formula') },
                        { value: 'breast' as const, label: t('feeding.milkType.breast') }
                    ]}
                />
                {feedingSettings.defaultMilkType === 'formula' && (
                    <TextField
                        // Saved when the field loses focus; the morning review uses it to judge the amount.
                        key={feedingSettings.milkProduct}
                        defaultValue={feedingSettings.milkProduct}
                        label={t('menu.milkProduct')}
                        placeholder={t('menu.milkProductPlaceholder')}
                        inputProps={{ maxLength: MAX_MILK_PRODUCT_LENGTH }}
                        onBlur={(event) => {
                            if (event.target.value.trim() !== feedingSettings.milkProduct) {
                                onChangeFeedingSettings({ ...feedingSettings, milkProduct: event.target.value });
                            }
                        }}
                        fullWidth
                        size="small"
                        sx={{ ...fieldSx, mt: 1.5 }}
                    />
                )}
                <Typography sx={{ fontSize: 12, color: '#64748b', mt: 1 }}>{t('settingsPage.milkHint')}</Typography>
            </Section>

            <Section title={t('settingsPage.reminders')}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <NotificationsIcon sx={{ fontSize: 20, color: settings.reminderEnabled ? '#10b981' : '#6b7f8a' }} />
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#101c22' }}>{t('settingsPage.reminderSwitch')}</Typography>
                    </Box>
                    <Switch checked={settings.reminderEnabled} onChange={settings.onToggleReminder} inputProps={{ 'aria-label': t('settingsPage.reminderSwitch') }} />
                </Box>
                <Typography sx={{ fontSize: 12, color: '#64748b', mb: 1.25 }}>
                    {t('menu.notificationPermission')}: {t(`menu.permission.${settings.notificationPermission}`)} · {t('menu.push')}:{' '}
                    {settings.pushSupported ? (settings.pushEnabled ? t('menu.enabled') : t('menu.disabled')) : t('menu.permission.unsupported')}
                </Typography>
                <Label>{t('settingsPage.reminderInterval')}</Label>
                <ChoiceChips
                    color="#13a4ec"
                    selected={[settings.reminderIntervalMinutes]}
                    onToggle={settings.onChangeReminderInterval}
                    options={[60, 120, 180, 240].map((minutes) => ({ value: minutes, label: `${minutes / 60}h` }))}
                />
                {settings.pushSupported && (
                    <Button
                        onClick={settings.onSendTestPush}
                        startIcon={<SendIcon sx={{ fontSize: 16 }} />}
                        sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700, color: '#0f766e', bgcolor: '#e6fffa', borderRadius: '10px' }}
                    >
                        {t('menu.sendTestPush')}
                    </Button>
                )}
            </Section>

            <DriveSection />

            <Section title={t('settings.language')}>
                <LanguageSwitcher onChange={settings.onLanguageChange} />
                <Button
                    onClick={settings.onShowTranslations}
                    startIcon={<TranslateIcon sx={{ fontSize: 16 }} />}
                    sx={{ mt: 1.5, display: 'flex', textTransform: 'none', fontWeight: 700, color: '#0f766e', bgcolor: '#e0f2fe', borderRadius: '10px' }}
                >
                    {t('menu.editTranslations')}
                </Button>
            </Section>
        </Box>
    );
};

export default SettingsPage;
