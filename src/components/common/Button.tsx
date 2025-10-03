import React from 'react';
import { Button as MuiButton } from '@mui/material';

interface ButtonProps {
    label: string;
    onClick: () => void;
    style?: React.CSSProperties;
}

const Button: React.FC<ButtonProps> = ({ label, onClick, style }) => {
    return (
        <MuiButton onClick={onClick} style={style} variant="contained">
            {label}
        </MuiButton>
    );
};

export default Button;