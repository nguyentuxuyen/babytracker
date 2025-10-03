import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

interface LineChartProps {
  data: any[];
  dataKey: string;
  title: string;
  color: string;
  unit?: string;
  verticalLabels?: boolean;
}

const LineChart: React.FC<LineChartProps> = ({ data, dataKey, title, color, unit = '', verticalLabels = false }) => {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} mb={1}>{title}</Typography>
      <Box sx={{ width: '100%', height: 180, background: '#fafbfc', borderRadius: 2, border: '1px solid #eee', p: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <XAxis dataKey="date" angle={verticalLabels ? -45 : 0} textAnchor={verticalLabels ? 'end' : 'middle'} height={verticalLabels ? 40 : 20} fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${v}${unit}`} />
            <Tooltip formatter={(v: any) => `${v}${unit}`} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </ReLineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default LineChart;
