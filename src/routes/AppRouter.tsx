import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch, useLocation } from 'react-router-dom';
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
const MomentsMapPage = lazyPage(() => import('../pages/MomentsMapPage'));

// Fallback loader
const FallbackLoader = ({ fullScreen = true }: { fullScreen?: boolean }) => (
    <Box sx={{ display: 'flex', height: fullScreen ? '100vh' : '60vh', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress sx={{ color: '#13a4ec' }} />
    </Box>
);

// The page area alone waits for (or fails at) loading a page, so the bottom bar
// stays usable; and an error on one page goes away when another tab is opened.
const PageArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    return (
        <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<FallbackLoader fullScreen={false} />}>{children}</Suspense>
        </ErrorBoundary>
    );
};

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
                                <PageArea>
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
                                    <PrivateRoute path="/moments/map" component={MomentsMapPage} />
                                    <PrivateRoute path="/moments" component={MomentsPage} />
                                </Switch>
                                </PageArea>
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