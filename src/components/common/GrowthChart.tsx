import React, { useMemo } from 'react';
import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Box, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Activity, Baby } from '../../types';
import {
    WHO_WEIGHT_BOYS,
    WHO_WEIGHT_GIRLS,
    WHO_HEIGHT_BOYS,
    WHO_HEIGHT_GIRLS,
    GrowthStandard
} from '../../utils/growthStandards';

interface GrowthChartProps {
    baby: Baby;
    activities: Activity[];
}

const GrowthChart: React.FC<GrowthChartProps> = ({ baby, activities }) => {
    const [viewMode, setViewMode] = React.useState<'combined' | 'weight' | 'height'>('combined');

    const gender = baby.gender || 'male';
    const weightStandards = gender === 'male' ? WHO_WEIGHT_BOYS : WHO_WEIGHT_GIRLS;
    const heightStandards = gender === 'male' ? WHO_HEIGHT_BOYS : WHO_HEIGHT_GIRLS;

    // Prepare data
    const chartData = useMemo(() => {
        if (!baby.birthDate) return { standards: [], measurements: [] };

        const birthDate = new Date(baby.birthDate);
        const today = new Date();
        const currentAgeMonths = (today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        const maxAge = Math.max(12, Math.ceil(currentAgeMonths) + 1);

        // Create base data from standards (interpolate for smoother curves if needed, but we'll stick to provided points)
        // We'll generate data points for every month up to maxAge
        const data = [];
        
        // Helper to find standard values for a given month (linear interpolation)
        const getStandard = (standards: GrowthStandard[], month: number) => {
            // Find exact match
            const exact = standards.find(s => s.month === month);
            if (exact) return exact;

            // Interpolate
            const lower = standards.filter(s => s.month < month).pop();
            const upper = standards.find(s => s.month > month);

            if (lower && upper) {
                const ratio = (month - lower.month) / (upper.month - lower.month);
                return {
                    month,
                    n2sd: lower.n2sd + (upper.n2sd - lower.n2sd) * ratio,
                    median: lower.median + (upper.median - lower.median) * ratio,
                    p2sd: lower.p2sd + (upper.p2sd - lower.p2sd) * ratio
                };
            }
            return lower || upper || { month, n2sd: 0, median: 0, p2sd: 0 };
        };

        // 1. Add standard curves data points
        for (let m = 0; m <= maxAge; m++) {
            const wStd = getStandard(weightStandards, m);
            const hStd = getStandard(heightStandards, m);
            
            data.push({
                age: m,
                type: 'standard',
                wN2SD: wStd.n2sd,
                wMedian: wStd.median,
                wP2SD: wStd.p2sd,
                wRange: [wStd.n2sd, wStd.p2sd],
                hN2SD: hStd.n2sd,
                hMedian: hStd.median,
                hP2SD: hStd.p2sd,
                hRange: [hStd.n2sd, hStd.p2sd],
            });
        }

        // 2. Add baby's measurements
        // Filter measurement activities
        const measurements = activities
            .filter((a): a is Activity & { type: 'measurement' } => a.type === 'measurement')
            .filter(a => a.details.weight || a.details.height)
            .map(a => {
                const date = new Date(a.timestamp);
                const ageMonths = (date.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                return {
                    age: parseFloat(ageMonths.toFixed(1)),
                    weight: a.details.weight ? a.details.weight / 1000 : null, // Convert g to kg
                    height: a.details.height,
                    date: date.toLocaleDateString()
                };
            })
            .filter(m => m.age >= 0);

        // Add birth measurements if available
        if (baby.birthWeight || baby.birthHeight) {
            measurements.unshift({
                age: 0,
                weight: baby.birthWeight ? baby.birthWeight / 1000 : null,
                height: baby.birthHeight,
                date: birthDate.toLocaleDateString()
            });
        }

        return { standards: data, measurements };
    }, [baby, activities, weightStandards, heightStandards]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            // Find the measurement payload if hovering over a scatter point
            const measurement = payload.find((p: any) => p.dataKey === 'weight' || p.dataKey === 'height');
            
            if (measurement && measurement.payload.date) {
                return (
                    <Box sx={{ bgcolor: 'white', p: 1.5, border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                            Age: {label} months
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mb: 1, color: 'text.secondary' }}>
                            Date: {measurement.payload.date}
                        </Typography>
                        {measurement.payload.weight && (
                            <Typography variant="body2" color="#13a4ec">
                                Weight: {measurement.payload.weight} kg
                            </Typography>
                        )}
                        {measurement.payload.height && (
                            <Typography variant="body2" color="#10b981">
                                Height: {measurement.payload.height} cm
                            </Typography>
                        )}
                    </Box>
                );
            }

            return (
                <Box sx={{ bgcolor: 'white', p: 1, border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <Typography variant="caption">Age: {label} months</Typography>
                </Box>
            );
        }
        return null;
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, newMode) => newMode && setViewMode(newMode)}
                    size="small"
                    sx={{ height: 32 }}
                >
                    <ToggleButton value="combined">Combined</ToggleButton>
                    <ToggleButton value="weight">Weight</ToggleButton>
                    <ToggleButton value="height">Height</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Box sx={{ height: 400, width: '100%' }}>
                <ResponsiveContainer>
                    <ComposedChart margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                            dataKey="age" 
                            type="number" 
                            domain={[0, 'auto']} 
                            tickCount={12}
                            label={{ value: 'Age (months)', position: 'bottom', offset: 0, fontSize: 12 }}
                            allowDuplicatedCategory={false}
                        />
                        
                        {/* Y-Axis for Weight */}
                        {(viewMode === 'combined' || viewMode === 'weight') && (
                            <YAxis 
                                yAxisId="weight" 
                                orientation="left" 
                                label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#13a4ec' }}
                                domain={[0, 'auto']}
                                tick={{ fontSize: 11, fill: '#13a4ec' }}
                            />
                        )}

                        {/* Y-Axis for Height */}
                        {(viewMode === 'combined' || viewMode === 'height') && (
                            <YAxis 
                                yAxisId="height" 
                                orientation={viewMode === 'combined' ? "right" : "left"} 
                                label={{ value: 'Height (cm)', angle: 90, position: 'insideRight', fontSize: 12, fill: '#10b981' }}
                                domain={[40, 'auto']}
                                tick={{ fontSize: 11, fill: '#10b981' }}
                            />
                        )}

                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="top" height={80} iconSize={10} wrapperStyle={{ fontSize: '12px' }} />

                        {/* Weight Standards */}
                        {(viewMode === 'combined' || viewMode === 'weight') && (
                            <>
                                <Area
                                    yAxisId="weight"
                                    data={chartData.standards}
                                    type="monotone"
                                    dataKey="wRange"
                                    stroke="none"
                                    fill="#13a4ec"
                                    fillOpacity={0.1}
                                    name="Weight Safe Zone"
                                />
                                <Line
                                    yAxisId="weight"
                                    data={chartData.standards}
                                    type="monotone"
                                    dataKey="wMedian"
                                    stroke="#13a4ec"
                                    strokeDasharray="3 3"
                                    strokeOpacity={0.5}
                                    dot={false}
                                    name="Weight Median"
                                />
                                <Line
                                    yAxisId="weight"
                                    data={chartData.measurements}
                                    type="monotone"
                                    dataKey="weight"
                                    stroke="#13a4ec"
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: '#13a4ec', strokeWidth: 2, stroke: '#fff' }}
                                    name="My Baby's Weight"
                                    connectNulls
                                />
                            </>
                        )}

                        {/* Height Standards */}
                        {(viewMode === 'combined' || viewMode === 'height') && (
                            <>
                                <Area
                                    yAxisId="height"
                                    data={chartData.standards}
                                    type="monotone"
                                    dataKey="hRange"
                                    stroke="none"
                                    fill="#10b981"
                                    fillOpacity={0.1}
                                    name="Height Safe Zone"
                                />
                                <Line
                                    yAxisId="height"
                                    data={chartData.standards}
                                    type="monotone"
                                    dataKey="hMedian"
                                    stroke="#10b981"
                                    strokeDasharray="3 3"
                                    strokeOpacity={0.5}
                                    dot={false}
                                    name="Height Median"
                                />
                                <Line
                                    yAxisId="height"
                                    data={chartData.measurements}
                                    type="monotone"
                                    dataKey="height"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                                    name="My Baby's Height"
                                    connectNulls
                                />
                            </>
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
};

export default GrowthChart;