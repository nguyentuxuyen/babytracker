import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
// import Login from '../pages/Login';
// import BabyInfo from '../pages/BabyInfo';
// import Activities from '../pages/Activities';
// import Statistics from '../pages/Statistics';

const AppRouter: React.FC = () => {
    return (
        <Router>
            <Switch>
                {/* <Route path="/" exact component={Login} /> */}
                {/* <Route path="/baby-info" component={BabyInfo} /> */}
                {/* <Route path="/activities" component={Activities} /> */}
                {/* <Route path="/statistics" component={Statistics} /> */}
                <Route path="/" exact render={() => <div>Welcome to Baby Tracker</div>} />
            </Switch>
        </Router>
    );
};

export default AppRouter;