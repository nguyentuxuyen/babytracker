import React from 'react';
import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';
import {
    Baby,
    Bath,
    Bell,
    BellOff,
    Calendar,
    CalendarDays,
    ChartColumn,
    ChartLine,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleUserRound,
    Droplet,
    Eye,
    EyeOff,
    History,
    House,
    Info,
    LogOut,
    LucideIcon,
    Menu,
    Mic,
    Milk,
    Moon,
    NotebookPen,
    Pencil,
    Plus,
    Ruler,
    Search,
    Send,
    Sparkles,
    Square,
    Timer,
    Trash2,
    Utensils,
    X
} from 'lucide-react';

// Wrap a Lucide icon in MUI's SvgIcon so `sx`, `fontSize` and `color` keep working
// and selectors such as `.MuiSvgIcon-root` still match.
const createIcon = (Icon: LucideIcon, displayName: string) => {
    const Wrapped = React.forwardRef<SVGSVGElement, SvgIconProps>(({ sx, ...props }, ref) => (
        <SvgIcon
            ref={ref}
            component={Icon as React.ElementType}
            inheritViewBox
            {...props}
            // Lucide icons are stroke-based; SvgIcon would otherwise fill them
            sx={[{ fill: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}
        />
    ));
    Wrapped.displayName = displayName;
    return Wrapped;
};

// Navigation
export const HomeIcon = createIcon(House, 'HomeIcon');
export const HistoryIcon = createIcon(History, 'HistoryIcon');
export const ChartIcon = createIcon(ChartLine, 'ChartIcon');
export const BarChartIcon = createIcon(ChartColumn, 'BarChartIcon');
export const MenuIcon = createIcon(Menu, 'MenuIcon');
export const BackIcon = createIcon(ChevronLeft, 'BackIcon');
export const ChevronLeftIcon = createIcon(ChevronLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = createIcon(ChevronRight, 'ChevronRightIcon');
export const ChevronDownIcon = createIcon(ChevronDown, 'ChevronDownIcon');

// Activities
export const MilkIcon = createIcon(Milk, 'MilkIcon');
export const FoodIcon = createIcon(Utensils, 'FoodIcon');
export const SleepIcon = createIcon(Moon, 'SleepIcon');
export const BabyIcon = createIcon(Baby, 'BabyIcon');
export const BathIcon = createIcon(Bath, 'BathIcon');
export const MeasurementIcon = createIcon(Ruler, 'MeasurementIcon');
export const MemoIcon = createIcon(NotebookPen, 'MemoIcon');
export const UrineIcon = createIcon(Droplet, 'UrineIcon');
export const TimerIcon = createIcon(Timer, 'TimerIcon');

// Actions
export const AddIcon = createIcon(Plus, 'AddIcon');
export const EditIcon = createIcon(Pencil, 'EditIcon');
export const DeleteIcon = createIcon(Trash2, 'DeleteIcon');
export const CheckIcon = createIcon(Check, 'CheckIcon');
export const CloseIcon = createIcon(X, 'CloseIcon');
export const SearchIcon = createIcon(Search, 'SearchIcon');
export const SendIcon = createIcon(Send, 'SendIcon');
export const MicIcon = createIcon(Mic, 'MicIcon');
export const StopIcon = createIcon(Square, 'StopIcon');
export const SparklesIcon = createIcon(Sparkles, 'SparklesIcon');
export const VisibilityIcon = createIcon(Eye, 'VisibilityIcon');
export const VisibilityOffIcon = createIcon(EyeOff, 'VisibilityOffIcon');

// Misc
export const CalendarIcon = createIcon(Calendar, 'CalendarIcon');
export const CalendarDaysIcon = createIcon(CalendarDays, 'CalendarDaysIcon');
export const AccountIcon = createIcon(CircleUserRound, 'AccountIcon');
export const LogoutIcon = createIcon(LogOut, 'LogoutIcon');
export const NotificationsIcon = createIcon(Bell, 'NotificationsIcon');
export const NotificationsOffIcon = createIcon(BellOff, 'NotificationsOffIcon');
export const InfoIcon = createIcon(Info, 'InfoIcon');
