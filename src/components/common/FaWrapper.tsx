import React from 'react';
// Shared Lucide icons
import {
  HomeIcon,
  AddIcon,
  CalendarIcon as EventIcon,
  MenuIcon,
  BabyIcon as BabyChangingStationOutlinedIcon,
  FoodIcon as RestaurantOutlinedIcon,
  SleepIcon as BedtimeOutlinedIcon,
  MeasurementIcon as MonitorHeartOutlinedIcon,
  MemoIcon as EditNoteOutlinedIcon,
  BarChartIcon as AssessmentIcon
} from './icons';

// Default style - black icons
const defaultSx = { sx: { color: '#000000', fontSize: 24 } };

// Simple wrapper components using Lucide icons with black color
export const IconFaHome: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <HomeIcon {...merged} />;
};

export const IconFaPlus: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <AddIcon {...merged} />;
};

export const IconFaCalendar: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <EventIcon {...merged} />;
};

export const IconFaMenu: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <MenuIcon {...merged} />;
};

export const IconFaFeeding: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <RestaurantOutlinedIcon {...merged} />;
};

export const IconFaBaby: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <BabyChangingStationOutlinedIcon {...merged} />;
};

export const IconFaSleep: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <BedtimeOutlinedIcon {...merged} />;
};

export const IconFaMeasurement: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <MonitorHeartOutlinedIcon {...merged} />;
};

export const IconFaMemo: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <EditNoteOutlinedIcon {...merged} />;
};

export const IconFaChart: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  return <AssessmentIcon {...merged} />;
};

export const IconFaUrine: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  // Using a droplet-like icon for urine with black filter
  return (
    <div style={{ 
      fontSize: merged.sx?.fontSize || 24, 
      color: '#000000',
      filter: 'grayscale(1) brightness(0)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      💧
    </div>
  );
};

export const IconFaStool: React.FC<any> = (props) => {
  const merged = { ...defaultSx, ...props };
  // Using a different emoji for stool with black filter
  return (
    <div style={{ 
      fontSize: merged.sx?.fontSize || 24, 
      color: '#000000',
      filter: 'grayscale(1) brightness(0)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      💩
    </div>
  );
};

// no default export
