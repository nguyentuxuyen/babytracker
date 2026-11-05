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

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box sx={{ p: 2, mb: 1.5, borderRadius: '16px', bgcolor: '#ffffff', border: '1px solid #e5e7eb' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#101c22', mb: 1.25 }}>{title}</Typography>
        {children}
    </Box>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569', mb: 0.75 }}>{children}</Typography>
);

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
