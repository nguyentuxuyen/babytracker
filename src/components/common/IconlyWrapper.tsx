import React from 'react';
// Fallback imports from MUI
import HomeIcon from '@mui/icons-material/Home';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import MenuIcon from '@mui/icons-material/Menu';

// Try to dynamically require Iconly package. This keeps the app safe if the package
// isn't installed yet. We prefer Iconly Bold set when available.
let Iconly: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Iconly = require('@iconly/react');
} catch (e) {
  Iconly = null;
}

export const IconHome: React.FC<any> = (props) => {
  const mergedProps = { sx: { color: '#000' }, ...props };
  if (Iconly && Iconly.IconlyBold && Iconly.IconlyBold.Home) {
    const Comp = Iconly.IconlyBold.Home;
    return <Comp {...mergedProps} />;
  }
  return <HomeIcon {...mergedProps} />;
};

export const IconAdd: React.FC<any> = (props) => {
  const mergedProps = { sx: { color: '#000' }, ...props };
  if (Iconly && Iconly.IconlyBold && Iconly.IconlyBold.Add) {
    const Comp = Iconly.IconlyBold.Add;
    return <Comp {...mergedProps} />;
  }
  return <AddIcon {...mergedProps} />;
};

export const IconEvent: React.FC<any> = (props) => {
  const mergedProps = { sx: { color: '#000' }, ...props };
  if (Iconly && Iconly.IconlyBold && Iconly.IconlyBold.Calendar) {
    const Comp = Iconly.IconlyBold.Calendar;
    return <Comp {...mergedProps} />;
  }
  return <EventIcon {...mergedProps} />;
};

export const IconMenu: React.FC<any> = (props) => {
  const mergedProps = { sx: { color: '#000' }, ...props };
  if (Iconly && Iconly.IconlyBold && Iconly.IconlyBold.Category) {
    const Comp = Iconly.IconlyBold.Category;
    return <Comp {...mergedProps} />;
  }
  return <MenuIcon {...mergedProps} />;
};

// No default export; use named exports above.
