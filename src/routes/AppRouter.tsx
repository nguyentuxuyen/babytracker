import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import BottomNav from '../components/layout/BottomNav';
import PrivateRoute from '../components/PrivateRoute';
import ErrorBoundary from '../components/ErrorBoundary';
import LoginPage from '../pages/LoginPage';
import { lazyPage, prefetchPages } from '../utils/lazyPage';

// Lazy loading large pages
const ActivitiesPageNew = lazyPage(() => import('../pages/ActivitiesPageNew'));
const BabyInfoPageNew = lazyPage(() => import('../pages/BabyInfoPageNew'));
const StatsPageNewGlass = lazyPage(() => import('../pages/StatsPageNewGlass'));
const MilestonesPage = lazyPage(() => import('../pages/MilestonesPage'));
const WonderWeeksPage = lazyPage(() => import('../pages/WonderWeeksPage'));
const FoodHistoryPage = lazyPage(() => import('../pages/FoodHistoryPage'));
const TimelinePage = lazyPage(() => import('../pages/TimelinePage'));
const DailyReviewsPage = lazyPage(() => import('../pages/DailyReviewsPage'));
const SettingsPage = lazyPage(() => import('../pages/SettingsPage'));
const MomentsPage = lazyPage(() => import('../pages/MomentsPage'));

// Fallback loader
const FallbackLoader = () => (
    <Box sx={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#13a4ec' }} />
    </Box>
);

const AppRouter: React.FC = () => {
    // Load the other pages in the background so switching tabs never waits on (or fails at) the network.
    useEffect(() => prefetchPages(), []);

    return (
        <Router>
            <ErrorBoundary>
                <Suspense fallback={<FallbackLoader />}>
                    <Switch>
                        {/* Public route - MUST be first and outside Box wrapper */}
                        <Route path="/login" exact component={LoginPage} />
                    
                        {/* Private routes with bottom padding for BottomNav */}
                        <Route path="/">
                            <Box sx={{ pb: 'calc(88px + env(safe-area-inset-bottom))' }}>
                                <Switch>
                                    <PrivateRoute path="/" exact component={ActivitiesPageNew} />
                                    <PrivateRoute path="/baby-info" component={BabyInfoPageNew} />
                                    <PrivateRoute path="/activities" component={ActivitiesPageNew} />
                                    <PrivateRoute path="/timeline" component={TimelinePage} />
                                    <PrivateRoute path="/statistics" component={StatsPageNewGlass} />
                                    <PrivateRoute path="/milestones" component={MilestonesPage} />
                                    <PrivateRoute path="/wonder-weeks" component={WonderWeeksPage} />
                                    <PrivateRoute path="/food-history" component={FoodHistoryPage} />
                                    <PrivateRoute path="/reviews" component={DailyReviewsPage} />
                                    <PrivateRoute path="/settings" component={SettingsPage} />
                                    <PrivateRoute path="/moments" component={MomentsPage} />
                                </Switch>
                            </Box>
                            <BottomNav />
                        </Route>
                    </Switch>
                </Suspense>
            </ErrorBoundary>
        </Router>
    );
};

export default AppRouter;