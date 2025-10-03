import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { IconFaHome } from '../common/FaWrapper';

const Header: React.FC = () => {
    return (
        <AppBar position="static">
            <Toolbar>
                <IconFaHome sx={{ mr: 1 }} />
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                    Baby Tracker
                </Typography>
                <Button color="inherit" component={Link} to="/baby-info">
                    Baby Info
                </Button>
                <Button color="inherit" component={Link} to="/activities">
                    Activities
                </Button>
                <Button color="inherit" component={Link} to="/statistics">
                    Statistics
                </Button>
            </Toolbar>
        </AppBar>
    );
};

export default Header;