import { createTheme } from '@mui/material/styles';

// New Design System (based on mockup references)
const colors = {
  // Primary colors
  primary: '#13a4ec',
  primaryLight: '#13a4ec33', // 20% opacity for icon backgrounds
  
  // Background colors
  backgroundLight: '#f6f7f8',
  backgroundDark: '#101c22',
  
  // Surface/Card colors
  surfaceLight: '#ffffff',
  surfaceDark: '#1a2a33',
  
  // Subtle/Secondary backgrounds
  subtleLight: '#e3e8eb',
  subtleDark: '#2b3d49',
  
  // Text colors
  textLight: '#101c22',
  textDark: '#f6f7f8',
  textSubtleLight: '#6b7f8a',
  textSubtleDark: '#a0b0b9',
  
  // Border colors
  borderLight: '#e5e7eb',
  borderDark: '#374151',
  
  // Utility colors
  danger: '#ef4444',
  info: '#13a4ec',
  warning: '#f59e0b',
  success: '#10b981'
};

const typography = {
  fontFamily: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  h1: { fontSize: '22px', fontWeight: 700, lineHeight: '28px' },
  h2: { fontSize: '20px', fontWeight: 700, lineHeight: '28px' },
  h3: { fontSize: '16px', fontWeight: 600, lineHeight: '24px' },
  h4: { fontSize: '14px', fontWeight: 600, lineHeight: '20px' },
  body1: { fontSize: '16px', fontWeight: 400, lineHeight: '24px' },
  body2: { fontSize: '14px', fontWeight: 400, lineHeight: '20px' },
  caption: { fontSize: '12px', fontWeight: 500, lineHeight: '16px' }
};

const theme = createTheme({
  palette: {
    primary: { main: colors.primary, light: colors.primaryLight },
    secondary: { main: colors.info },
    error: { main: colors.danger },
    warning: { main: colors.warning },
    success: { main: colors.success },
    background: { default: colors.backgroundLight, paper: colors.surfaceLight },
    text: { primary: colors.textLight, secondary: colors.textSubtleLight }
  },
  typography: {
    fontFamily: typography.fontFamily,
    h1: typography.h1,
    h2: typography.h2,
    h3: typography.h3,
    h4: typography.h4,
    body1: typography.body1,
    body2: typography.body2,
    caption: typography.caption
  },
  shape: { borderRadius: 12 }, // 0.75rem default
  spacing: 4,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.backgroundLight,
          color: colors.textLight,
          fontFamily: typography.fontFamily
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          height: 48,
          textTransform: 'none',
          borderRadius: 12,
          paddingLeft: 16,
          paddingRight: 16,
          fontWeight: 700,
          fontSize: '14px'
        },
        sizeSmall: { height: 40, fontSize: '14px' }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: 'none',
          border: `1px solid ${colors.borderLight}`
        }
      }
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          backgroundColor: colors.surfaceLight,
          borderTop: `1px solid ${colors.borderLight}`,
          boxShadow: 'none'
        }
      }
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          paddingLeft: 8,
          paddingRight: 8,
          color: colors.textSubtleLight,
          '&.Mui-selected': {
            color: colors.primary
          }
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: 12 }
      }
    }
  }
});

export default theme;
