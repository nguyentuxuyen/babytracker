import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import BottomNav from '../components/layout/BottomNav';
import PrivateRoute from '../components/PrivateRoute';
import LoginPage from '../pages/LoginPage';

// Lazy loading large pages
const ActivitiesPageNew = lazy(() => import('../pages/ActivitiesPageNew'));
const BabyInfoPageNew = lazy(() => import('../pages/BabyInfoPageNew'));
const StatsPageNewGlass = lazy(() => import('../pages/StatsPageNewGlass'));
const MilestonesPage = lazy(() => import('../pages/MilestonesPage'));
const WonderWeeksPage = lazy(() => import('../pages/WonderWeeksPage'));
const FoodHistoryPage = lazy(() => import('../pages/FoodHistoryPage'));

// Fallback loader
const FallbackLoader = () => (
    <Box sx={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#13a4ec' }} />
    </Box>
);

const AppRouter: React.FC = () => {
    return (
        <Router>
            <Suspense fallback={<FallbackLoader />}>
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
                                <PrivateRoute path="/recent-activities" component={ActivitiesPageNew} />
                                <PrivateRoute path="/statistics" component={StatsPageNewGlass} />
                                <PrivateRoute path="/milestones" component={MilestonesPage} />
                                <PrivateRoute path="/wonder-weeks" component={WonderWeeksPage} />
                                <PrivateRoute path="/food-history" component={FoodHistoryPage} />
                            </Switch>
                        </Box>
                        <BottomNav />
                    </Route>
                </Switch>
            </Suspense>
        </Router>
    );
};

export default AppRouter;