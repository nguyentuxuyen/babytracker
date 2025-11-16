import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { Box } from '@mui/material';
import ActivitiesPageNew from '../pages/ActivitiesPageNew';
import BabyInfoPageNew from '../pages/BabyInfoPageNew';
import StatsPageNewGlass from '../pages/StatsPageNewGlass';
import MilestonesPage from '../pages/MilestonesPage';
import WonderWeeksPage from '../pages/WonderWeeksPage';
import LoginPage from '../pages/LoginPage';
import BottomNav from '../components/layout/BottomNav';
import PrivateRoute from '../components/PrivateRoute';

const AppRouter: React.FC = () => {
    return (
        <Router>
            <Switch>
                {/* Public route - MUST be first and outside Box wrapper */}
                <Route path="/login" exact component={LoginPage} />
                
                {/* Private routes with bottom padding for BottomNav */}
                <Route path="/">
                    <Box sx={{ pb: { xs: '76px', sm: '80px' } }}>
                        <Switch>
                            <PrivateRoute path="/" exact component={ActivitiesPageNew} />
                            <PrivateRoute path="/baby-info" component={BabyInfoPageNew} />
                            <PrivateRoute path="/activities" component={ActivitiesPageNew} />
                            <PrivateRoute path="/statistics" component={StatsPageNewGlass} />
                            <PrivateRoute path="/milestones" component={MilestonesPage} />
                            <PrivateRoute path="/wonder-weeks" component={WonderWeeksPage} />
                        </Switch>
                    </Box>
                    <BottomNav />
                </Route>
            </Switch>
        </Router>
    );
};

export default AppRouter;