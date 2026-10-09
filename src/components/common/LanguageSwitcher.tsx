import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AppLanguage, SUPPORTED_LANGUAGES, changeLanguage, currentLanguage } from '../../i18n';

type LanguageSwitcherProps = {
    onChange?: (language: AppLanguage) => void;
};

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onChange }) => {
    // useTranslation re-renders this component whenever the language changes.
    const { t } = useTranslation();
    const selected = currentLanguage();

    return (
        <ToggleButtonGroup
            value={selected}
            exclusive
            size="small"
            aria-label={t('settings.language')}
            onChange={(_, value: AppLanguage | null) => {
                if (!value || value === selected) return;
                void changeLanguage(value).then(() => onChange?.(value));
            }}
            sx={{ flexWrap: 'wrap' }}
        >
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                <ToggleButton
                    key={code}
                    value={code}
                    lang={code}
                    sx={{ px: 1.25, py: 0.25, fontSize: '12px', textTransform: 'none' }}
                >
                    {label}
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    );
};

export default LanguageSwitcher;
