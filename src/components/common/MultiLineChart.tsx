import React from 'react';
import { Box, Typography, Checkbox, FormControlLabel, Stack } from '@mui/material';
import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';

interface MultiLineChartProps {
  data: any[];
  title: string;
  lines: Array<{
    dataKey: string;
    label: string;
    color: string;
    visible: boolean;
  }>;
  onToggleLine: (dataKey: string) => void;
  unit?: string;
  verticalLabels?: boolean;
}

const MultiLineChart: React.FC<MultiLineChartProps> = ({ data, title, lines, onToggleLine, unit = '', verticalLabels = false }) => {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} mb={1}>{title}</Typography>
      <Stack direction="row" spacing={2} mb={1}>
        {lines.map(line => (
          <FormControlLabel
            key={line.dataKey}
            control={<Checkbox checked={line.visible} onChange={() => onToggleLine(line.dataKey)} sx={{ color: line.color }} />}
            label={<span style={{ color: line.color }}>{line.label}</span>}
          />
        ))}
      </Stack>
      <Box sx={{ width: '100%', height: 180, background: '#fafbfc', borderRadius: 2, border: '1px solid #eee', p: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <XAxis dataKey="date" angle={verticalLabels ? -45 : 0} textAnchor={verticalLabels ? 'end' : 'middle'} height={verticalLabels ? 40 : 20} fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${v}${unit}`} />
            <Tooltip formatter={(v: any) => `${v}${unit}`} />
            <Legend />
            {lines.filter(l => l.visible).map(line => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default MultiLineChart;
