import React from 'react';
import { Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';

const Navbar: React.FC = () => {
    return (
        <AppBar position="static">
            <Toolbar>
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                    Baby Tracker
                </Typography>
                <Button color="inherit" component={Link} to="/baby-info">
                    Thông Tin Bé
                </Button>
                <Button color="inherit" component={Link} to="/activities">
                    Hoạt Động
                </Button>
                <Button color="inherit" component={Link} to="/statistics">
                    Thống Kê
                </Button>
                        <Button color="inherit" component={Link} to="/milestones">
                            Milestones
                        </Button>
            </Toolbar>
        </AppBar>
    );
};

export default Navbar;