import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useBaby } from '../contexts/BabyContext';
import PageHeader from '../components/common/PageHeader';

// Timing of the 10 Wonder Weeks leaps; names, descriptions and skills live in the locale files.
const wonderWeeksData = [
    { id: 1, startWeek: 4, endWeek: 5 },
    { id: 2, startWeek: 7, endWeek: 9 },
    { id: 3, startWeek: 11, endWeek: 12 },
    { id: 4, startWeek: 14, endWeek: 19 },
    { id: 5, startWeek: 22, endWeek: 26 },
    { id: 6, startWeek: 33, endWeek: 37 },
    { id: 7, startWeek: 41, endWeek: 46 },
    { id: 8, startWeek: 50, endWeek: 55 },
    { id: 9, startWeek: 59, endWeek: 64 },
    { id: 10, startWeek: 72, endWeek: 77 },
];

const WonderWeeksPage: React.FC = () => {
    const { baby } = useBaby();
    const { t } = useTranslation();

    const calculateAgeInWeeks = () => {
        if (!baby?.birthDate) return 0;
        
        // Wonder Weeks are calculated from the due date if available, otherwise birth date
        const baseDate = baby.dueDate ? new Date(baby.dueDate) : new Date(baby.birthDate);
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - baseDate.getTime());
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
        return diffWeeks;
    };

    const ageInWeeks = calculateAgeInWeeks();

    const getCurrentAndNextLeap = () => {
        const currentLeap = wonderWeeksData.find(leap => ageInWeeks >= leap.startWeek && ageInWeeks <= leap.endWeek);
        const nextLeap = wonderWeeksData.find(leap => leap.startWeek > ageInWeeks);
        return { currentLeap, nextLeap };
    };

    const { currentLeap, nextLeap } = getCurrentAndNextLeap();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f3f4f6', pb: '80px' }}>
            <Box sx={{ px: 2, pt: 2 }}>
                <PageHeader back title={t('wonderWeeks.title')} />
            </Box>

            {/* Content */}
            <Box sx={{ px: 2, pb: 2 }}>
                <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Typography sx={{ fontWeight: 'bold', color: '#1f2937', mb: 1 }}>{t('wonderWeeks.age', { count: ageInWeeks })}</Typography>
                    {currentLeap && <Typography sx={{ color: '#ef4444' }}>{t('wonderWeeks.currentLeap', { id: currentLeap.id })}</Typography>}
                    {nextLeap && !currentLeap && <Typography sx={{ color: '#3b82f6' }}>{t('wonderWeeks.nextLeap', { id: nextLeap.id, week: nextLeap.startWeek })}</Typography>}
                     <Typography sx={{ fontSize: '0.8rem', color: '#6b7280', mt: 1 }}>
                        {t(baby?.dueDate ? 'wonderWeeks.noteFromDueDate' : 'wonderWeeks.noteFromBirth')}
                    </Typography>
                </Box>

                {wonderWeeksData.map((leap, index) => {
                    const isCurrent = currentLeap?.id === leap.id;
                    const isNext = nextLeap?.id === leap.id && !currentLeap;
                    const isPast = leap.endWeek < ageInWeeks;

                    return (
                        <Box
                            key={leap.id}
                            sx={{
                                mb: 2,
                                bgcolor: 'white',
                                borderRadius: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                border: isCurrent ? '2px solid #ef4444' : (isNext ? '2px solid #3b82f6' : 'none'),
                                opacity: isPast ? 0.7 : 1,
                            }}
                        >
                            <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
                                <Typography sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#111827' }}>
                                    {t('wonderWeeks.leapTitle', { id: leap.id, name: t(`wonderWeeks.leaps.${leap.id}.name`) })}
                                </Typography>
                                <Typography sx={{ fontSize: '0.9rem', color: '#6b7280' }}>
                                    {t('wonderWeeks.weeksRange', { start: leap.startWeek, end: leap.endWeek })}
                                </Typography>
                            </Box>
                            <Box sx={{ p: 2 }}>
                                <Typography sx={{ mb: 1.5, color: '#374151' }}>{t(`wonderWeeks.leaps.${leap.id}.description`)}</Typography>
                                <Typography sx={{ fontWeight: 'bold', color: '#1f2937', mb: 1 }}>{t('wonderWeeks.newSkills')}</Typography>
                                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                                    {(t(`wonderWeeks.leaps.${leap.id}.skills`, { returnObjects: true }) as string[]).map((skill, i) => (
                                        <Typography component="li" key={i} sx={{ mb: 0.5, color: '#374151' }}>{skill}</Typography>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default WonderWeeksPage;
