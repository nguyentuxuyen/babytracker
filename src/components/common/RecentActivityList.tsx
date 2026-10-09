import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../i18n';
import { getActivityColor, getActivityDetails, getActivityIcon, getActivityLabel } from './activityDisplay';

type RecentActivity = {
    id: string;
    type: string;
    timestamp: Date | string;
    details?: unknown;
};

type RecentActivityListProps = {
    activities: RecentActivity[];
    limit?: number;
    onSeeAll?: () => void;
};

const RecentActivityList: React.FC<RecentActivityListProps> = ({ activities, limit = 5, onSeeAll }) => {
    const { t } = useTranslation();
    const locale = localeTag();
    const recent = [...activities]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

    return (
        <Box sx={{ bgcolor: '#ffffff', borderRadius: '20px', border: '1px solid #e5e7eb', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: recent.length ? 1 : 0.5 }}>
                <Typography sx={{ fontSize: 17, fontWeight: 700, color: '#101c22' }}>{t('home.recent')}</Typography>
                {onSeeAll && recent.length > 0 && (
                    <Button size="small" onClick={onSeeAll} sx={{ height: 40, px: 1.5, fontWeight: 600 }}>
                        {t('home.seeAll')}
                    </Button>
                )}
            </Box>
            {recent.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: '#94a3b8', py: 1 }}>{t('timeline.empty')}</Typography>
            ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {recent.map((activity, index) => {
                        const color = getActivityColor(activity);
                        const details = getActivityDetails(activity).join(' · ');
                        return (
                            <Box
                                component="li"
                                key={activity.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    py: 1.25,
                                    borderTop: index === 0 ? 'none' : '1px solid #f1f5f9'
                                }}
                            >
                                <Typography sx={{ width: 44, flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                    {new Date(activity.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                                <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '& svg': { fontSize: 20 } }}>
                                    {getActivityIcon(activity)}
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#101c22' }} noWrap>{getActivityLabel(activity)}</Typography>
                                    {details && <Typography sx={{ fontSize: 13, color: '#6b7f8a' }} noWrap>{details}</Typography>}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
};

export default RecentActivityList;
