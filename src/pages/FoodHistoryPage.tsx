import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Typography, Chip, Stack, TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { firestore } from '../firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { Activity } from '../types';

type SolidFeedingActivity = Activity & {
    details: Activity['details'] & {
        foodType?: string;
        foodItem?: string;
        amount?: number | string;
        foodPreference?: string;
        isAllergic?: boolean;
    };
};

const isSolidFeeding = (a: Activity): a is SolidFeedingActivity => {
    return a.type === 'feeding' && a.details && (a as any).details.foodType === 'solid';
};

const preferenceLabel = (value?: string) => {
    switch (value) {
        case 'enthusiastic':
            return 'よく食べる';
        case 'normal':
            return '普通';
        case 'dislike':
            return '嫌がる';
        case 'allergic':
            return 'アレルギー';
        default:
            return '普通';
    }
};

const FoodHistoryPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [foods, setFoods] = useState<SolidFeedingActivity[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPreference, setFilterPreference] = useState<string>('all');

    useEffect(() => {
        const load = async () => {
            if (!currentUser?.uid) return;
            const list = await firestore.getActivities(currentUser.uid);
            const filtered = list.filter(isSolidFeeding);
            filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setFoods(filtered);
        };
        load();
    }, [currentUser]);

    const filteredFoods = foods.filter(item => {
        const details = item.details || {} as SolidFeedingActivity['details'];
        const foodName = details.foodItem || '';
        const matchesSearch = foodName.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (filterPreference === 'all') return matchesSearch;
        
        // Handle allergy filter specifically if needed, or just match the preference string
        // Note: The data structure has both foodPreference string and isAllergic boolean
        // If user selects 'allergic', we should check both
        if (filterPreference === 'allergic') {
            return matchesSearch && (details.foodPreference === 'allergic' || details.isAllergic);
        }
        
        return matchesSearch && details.foodPreference === filterPreference;
    });

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f8', p: 2, pb: 10 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                離乳食の記録
            </Typography>

            <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    fullWidth
                    placeholder="料理を検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#9ca3af' }} />
                            </InputAdornment>
                        ),
                        sx: { borderRadius: '12px', bgcolor: 'white' }
                    }}
                    variant="outlined"
                    size="small"
                />
                
                <FormControl fullWidth size="small">
                    <InputLabel>反応で絞り込む</InputLabel>
                    <Select
                        value={filterPreference}
                        label="反応で絞り込む"
                        onChange={(e) => setFilterPreference(e.target.value)}
                        sx={{ borderRadius: '12px', bgcolor: 'white' }}
                    >
                        <MenuItem value="all">すべて</MenuItem>
                        <MenuItem value="enthusiastic">よく食べる</MenuItem>
                        <MenuItem value="normal">普通</MenuItem>
                        <MenuItem value="dislike">嫌がる</MenuItem>
                        <MenuItem value="allergic">アレルギー</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Stack spacing={2}>
                {filteredFoods.map((item) => {
                    const ts = new Date(item.timestamp);
                    const details = item.details || {} as SolidFeedingActivity['details'];
                    const amount = details.amount ?? '';
                    return (
                        <Card key={item.id} sx={{ borderRadius: '16px', border: '1px solid #e5e7eb' }}>
                            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Typography sx={{ fontSize: '16px', fontWeight: 700 }}>
                                    {details.foodItem || 'Món ăn'}
                                </Typography>
                                <Typography sx={{ fontSize: '13px', color: '#6b7f8a' }}>
                                    {ts.toLocaleDateString('vi-VN')} • {ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                    <Chip label={`量: ${amount}`} size="small" />
                                    <Chip label={preferenceLabel(details.foodPreference)} size="small" color={details.foodPreference === 'allergic' ? 'error' : 'default'} />
                                    {details.isAllergic && (
                                        <Chip label="アレルギー" size="small" color="error" />
                                    )}
                                </Stack>
                                {details.notes && (
                                    <Typography sx={{ fontSize: '13px', color: '#0f172a' }}>
                                        {details.notes}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
                {filteredFoods.length === 0 && (
                    <Typography sx={{ color: '#6b7f8a', fontSize: '14px', textAlign: 'center', mt: 4 }}>
                        {foods.length === 0 ? '記録された料理はありません。' : '一致する記録が見つかりません。'}
                    </Typography>
                )}
            </Stack>
        </Box>
    );
};

export default FoodHistoryPage;
