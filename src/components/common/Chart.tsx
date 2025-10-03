import React from 'react';
// import { Line } from 'react-chartjs-2';

interface ChartProps {
    data: {
        labels: string[];
        datasets: {
            label: string;
            data: number[];
            backgroundColor: string;
            borderColor: string;
            borderWidth: number;
        }[];
    };
    options?: {
        responsive: boolean;
        scales?: {
            y: {
                beginAtZero: boolean;
            };
        };
    };
}

const Chart: React.FC<ChartProps> = ({ data, options }) => {
    return (
        <div style={{ width: '100%', height: '400px', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p>Chart component đang được phát triển...</p>
        </div>
    );
};

export default Chart;