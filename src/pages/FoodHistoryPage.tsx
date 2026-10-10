import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../i18n';
import { Box, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { FoodIcon, SearchIcon } from '../components/common/icons';
import { ACTIVITY_COLORS } from '../components/common/activityDisplay';
import { ChoiceChips, SegmentedControl, fieldSx } from '../components/common/FormControls';
import { firestore } from '../firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { Activity } from '../types';

type Reaction = 'enthusiastic' | 'normal' | 'dislike' | 'allergic';
type ReactionFilter = Reaction | 'all';
type ViewMode = 'food' | 'date';

type Meal = {
    id: string;
    date: Date;
    name: string;
    amount: number;
    reaction: Reaction;
    notes?: string;
};

type FoodSummary = {
    key: string;
    name: string;
    meals: Meal[];
    lastDate: Date;
    averageAmount: number;
    everAllergic: boolean;
    reaction: Reaction;
};

const REACTION_COLORS: Record<Reaction, string> = {
    enthusiastic: '#10b981',
    normal: '#64748b',
    dislike: '#f59e0b',
    allergic: '#ef4444'
};

const ACCENT = ACTIVITY_COLORS.solid;

// "Cà rốt" and "ca rot" should find the same dish.
const searchKey = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

const toMeal = (activity: Activity): Meal | null => {
    const details = (activity.details || {}) as Record<string, unknown>;
    if (activity.type !== 'feeding' || details.foodType !== 'solid') return null;
    const preference = String(details.foodPreference || '');
    const reaction: Reaction = details.isAllergic || preference === 'allergic'
        ? 'allergic'
        : (['enthusiastic', 'dislike'].includes(preference) ? preference as Reaction : 'normal');
    return {
        id: activity.id,
        date: new Date(activity.timestamp),
        name: String(details.foodItem || '').trim(),
        amount: Number(details.amount) || 0,
        reaction,
        notes: details.notes ? String(details.notes) : undefined
    };
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const ReactionBadge: React.FC<{ reaction: Reaction }> = ({ reaction }) => {
    const { t } = useTranslation();
    const color = REACTION_COLORS[reaction];
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: '999px', bgcolor: `${color}18`, color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />
            {t(`feeding.reaction.${reaction}`)}
        </Box>
    );
};

const FoodHistoryPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { t } = useTranslation();
    const locale = localeTag();
    const [meals, setMeals] = useState<Meal[] | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [reactionFilter, setReactionFilter] = useState<ReactionFilter>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('food');
    const [expandedFood, setExpandedFood] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!currentUser?.uid) return;
            const list = await firestore.getActivities(currentUser.uid);
            const solid = list.map(toMeal).filter((meal): meal is Meal => Boolean(meal));
            solid.sort((a, b) => b.date.getTime() - a.date.getTime());
            if (!cancelled) setMeals(solid);
        };
        load();
        return () => { cancelled = true; };
    }, [currentUser]);

    const foods = useMemo<FoodSummary[]>(() => {
        const groups = new Map<string, Meal[]>();
        for (const meal of meals || []) {
            const key = searchKey(meal.name) || '?';
            const group = groups.get(key);
            if (group) group.push(meal); else groups.set(key, [meal]);
        }
        return Array.from(groups.entries()).map(([key, group]) => {
            const withAmount = group.filter((meal) => meal.amount > 0);
            const everAllergic = group.some((meal) => meal.reaction === 'allergic');
            return {
                key,
                name: group[0].name || t('foodHistory.dish'),
                meals: group,
                lastDate: group[0].date,
                averageAmount: withAmount.length ? Math.round(withAmount.reduce((sum, meal) => sum + meal.amount, 0) / withAmount.length) : 0,
                everAllergic,
                // An allergy outweighs any later reaction; otherwise show the latest one.
                reaction: everAllergic ? 'allergic' : group[0].reaction
            };
        });
    }, [meals, t]);

    const query = searchKey(searchTerm);
    const visibleFoods = useMemo(() => foods.filter((food) => (
        (!query || food.key.includes(query))
        && (reactionFilter === 'all' || food.reaction === reactionFilter)
    )), [foods, query, reactionFilter]);
    const visibleMeals = useMemo(() => (meals || []).filter((meal) => (
        (!query || searchKey(meal.name).includes(query))
        && (reactionFilter === 'all' || meal.reaction === reactionFilter)
    )), [meals, query, reactionFilter]);

    const mealsByDay = useMemo(() => {
        const days: Array<{ day: Date; meals: Meal[] }> = [];
        for (const meal of visibleMeals) {
            const day = startOfDay(meal.date);
            const last = days[days.length - 1];
            if (last && last.day.getTime() === day.getTime()) last.meals.push(meal);
            else days.push({ day, meals: [meal] });
        }
        return days;
    }, [visibleMeals]);

    const dayLabel = (day: Date) => {
        const today = startOfDay(new Date());
        const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
        if (diff === 0) return t('common.today');
        if (diff === 1) return t('foodHistory.yesterday');
        return day.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'numeric' });
    };

    const lastEatenLabel = (date: Date) => {
        const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86400000);
        if (diff <= 0) return t('common.today');
        if (diff === 1) return t('foodHistory.yesterday');
        return t('relative.daysAgo', { count: diff });
    };

    const timeLabel = (date: Date) => date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    const lovedCount = foods.filter((food) => food.reaction === 'enthusiastic').length;
    const allergyCount = foods.filter((food) => food.everAllergic).length;
    const isEmpty = viewMode === 'food' ? visibleFoods.length === 0 : visibleMeals.length === 0;

    const reactionOptions: Array<{ value: ReactionFilter; label: React.ReactNode; dot?: string; danger?: boolean }> = [
        { value: 'all', label: t('common.all') },
        { value: 'enthusiastic', label: t('feeding.reaction.enthusiastic'), dot: REACTION_COLORS.enthusiastic },
        { value: 'normal', label: t('feeding.reaction.normal'), dot: REACTION_COLORS.normal },
        { value: 'dislike', label: t('feeding.reaction.dislike'), dot: REACTION_COLORS.dislike },
        { value: 'allergic', label: t('feeding.reaction.allergic'), danger: true }
    ];

    return (
        <Box sx={{ px: 2, pt: 2, maxWidth: 720, mx: 'auto' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#101c22' }}>{t('foodHistory.title')}</Typography>
            {meals && meals.length > 0 && (
                <Typography sx={{ fontSize: 14, color: '#6b7f8a', mt: 0.25 }}>
                    {t('foodHistory.subtitle', { foods: foods.length, meals: meals.length })}
                </Typography>
            )}

            {meals && meals.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2 }}>
                    {[
                        { label: t('foodHistory.triedCount'), value: foods.length, color: ACCENT, filter: 'all' as ReactionFilter },
                        { label: t('foodHistory.lovedCount'), value: lovedCount, color: REACTION_COLORS.enthusiastic, filter: 'enthusiastic' as ReactionFilter },
                        { label: t('feeding.reaction.allergic'), value: allergyCount, color: allergyCount ? REACTION_COLORS.allergic : '#94a3b8', filter: 'allergic' as ReactionFilter }
                    ].map((tile) => (
                        <Box
                            key={tile.label}
                            component="button"
                            type="button"
                            onClick={() => { setViewMode('food'); setReactionFilter(tile.filter); }}
                            sx={{ textAlign: 'left', border: `1px solid ${tile.color}40`, bgcolor: `${tile.color}14`, borderRadius: '16px', p: 1.5, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Typography sx={{ fontSize: 22, fontWeight: 800, color: tile.color, lineHeight: 1.1 }}>{tile.value}</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#475569', mt: 0.5 }} noWrap>{tile.label}</Typography>
                        </Box>
                    ))}
                </Box>
            )}

            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <SegmentedControl<ViewMode>
                    options={[
                        { value: 'food', label: t('foodHistory.byFood') },
                        { value: 'date', label: t('foodHistory.byDate') }
                    ]}
                    value={viewMode}
                    onChange={setViewMode}
                    color={ACCENT}
                />
                <TextField
                    fullWidth
                    hiddenLabel
                    variant="filled"
                    placeholder={t('foodHistory.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    sx={fieldSx}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#94a3b8' }} />
                            </InputAdornment>
                        )
                    }}
                    inputProps={{ 'aria-label': t('foodHistory.searchPlaceholder'), style: { height: 24 } }}
                />
                <Box sx={{ overflowX: 'auto', mx: -2, px: 2, '& > div': { flexWrap: 'nowrap' }, '& button': { flexShrink: 0 } }}>
                    <ChoiceChips<ReactionFilter>
                        options={reactionOptions}
                        selected={[reactionFilter]}
                        onToggle={setReactionFilter}
                        color={ACCENT}
                    />
                </Box>
            </Box>

            <Box sx={{ mt: 2, pb: 2 }}>
                {meals === null && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ color: ACCENT }} />
                    </Box>
                )}

                {meals !== null && isEmpty && (
                    <Box sx={{ textAlign: 'center', py: 6, color: '#94a3b8' }}>
                        <FoodIcon sx={{ fontSize: 40, color: '#cbd5e1' }} />
                        <Typography sx={{ fontSize: 14, mt: 1 }}>
                            {meals.length === 0 ? t('foodHistory.empty') : t('foodHistory.noMatch')}
                        </Typography>
                    </Box>
                )}

                {meals !== null && viewMode === 'food' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        {visibleFoods.map((food) => {
                            const expanded = expandedFood === food.key;
                            const color = food.everAllergic ? REACTION_COLORS.allergic : ACCENT;
                            return (
                                <Box key={food.key} sx={{ bgcolor: '#ffffff', borderRadius: '18px', border: `1px solid ${food.everAllergic ? '#fecaca' : '#e5e7eb'}`, overflow: 'hidden' }}>
                                    <Box
                                        component="button"
                                        type="button"
                                        aria-expanded={expanded}
                                        onClick={() => setExpandedFood(expanded ? null : food.key)}
                                        sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, border: 'none', bgcolor: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >
                                        <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <FoodIcon />
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#101c22', minWidth: 0 }} noWrap>{food.name}</Typography>
                                                <ReactionBadge reaction={food.reaction} />
                                            </Box>
                                            <Typography sx={{ fontSize: 13, color: '#6b7f8a', mt: 0.25 }} noWrap>
                                                {t('units.times', { count: food.meals.length })}
                                                {food.averageAmount > 0 && ` · ${t('foodHistory.averageAmount', { amount: food.averageAmount })}`}
                                                {` · ${lastEatenLabel(food.lastDate)}`}
                                            </Typography>
                                        </Box>
                                        <Typography sx={{ fontSize: 18, color: '#94a3b8', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</Typography>
                                    </Box>
                                    {expanded && (
                                        <Box component="ul" sx={{ listStyle: 'none', m: 0, px: 1.5, pb: 1, borderTop: '1px solid #f1f5f9' }}>
                                            {food.meals.map((meal) => (
                                                <Box component="li" key={meal.id} sx={{ py: 1, borderBottom: '1px solid #f8fafc', '&:last-of-type': { borderBottom: 'none' } }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Typography sx={{ fontSize: 13, color: '#475569', flex: 1 }}>
                                                            {dayLabel(startOfDay(meal.date))} · {timeLabel(meal.date)}
                                                        </Typography>
                                                        {meal.amount > 0 && <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#101c22' }}>{meal.amount}g</Typography>}
                                                        <ReactionBadge reaction={meal.reaction} />
                                                    </Box>
                                                    {meal.notes && <Typography sx={{ fontSize: 13, color: '#6b7f8a', mt: 0.25 }}>{meal.notes}</Typography>}
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {meals !== null && viewMode === 'date' && mealsByDay.map(({ day, meals: dayMeals }) => {
                    const total = dayMeals.reduce((sum, meal) => sum + meal.amount, 0);
                    return (
                        <Box key={day.getTime()} sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.75, px: 0.5 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{dayLabel(day)}</Typography>
                                {total > 0 && <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>{total}g</Typography>}
                            </Box>
                            <Box sx={{ bgcolor: '#ffffff', borderRadius: '18px', border: '1px solid #e5e7eb', px: 1.5 }}>
                                {dayMeals.map((meal, index) => (
                                    <Box key={meal.id} sx={{ py: 1.25, borderTop: index === 0 ? 'none' : '1px solid #f1f5f9' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                            <Typography sx={{ width: 44, flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{timeLabel(meal.date)}</Typography>
                                            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#101c22' }} noWrap>{meal.name || t('foodHistory.dish')}</Typography>
                                            {meal.amount > 0 && <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{meal.amount}g</Typography>}
                                            <ReactionBadge reaction={meal.reaction} />
                                        </Box>
                                        {meal.notes && <Typography sx={{ fontSize: 13, color: '#6b7f8a', mt: 0.25, pl: '54px' }}>{meal.notes}</Typography>}
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default FoodHistoryPage;
