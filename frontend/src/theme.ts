import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#14243A', // Brand Navy
      light: '#23395B',
      dark: '#0C1624',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#16B8A6', // Brand Teal
      light: '#38D9C5',
      dark: '#0F766E',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F7FA',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#172334',
      secondary: '#64748B',
    },
    error: {
      main: '#EF4444',
    },
    success: {
      main: '#10B981',
    },
    info: {
      main: '#0284C7',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: {
      fontWeight: 700,
      color: '#14243A',
    },
    h2: {
      fontWeight: 700,
      color: '#14243A',
    },
    h3: {
      fontWeight: 600,
      color: '#14243A',
    },
    h4: {
      fontWeight: 600,
      color: '#14243A',
    },
    h5: {
      fontWeight: 600,
      color: '#14243A',
    },
    h6: {
      fontWeight: 600,
      color: '#14243A',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 18px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(20, 36, 58, 0.15)',
          },
        },
        containedPrimary: {
          backgroundColor: '#14243A',
          '&:hover': {
            backgroundColor: '#23395B',
          },
        },
        containedSecondary: {
          backgroundColor: '#16B8A6',
          color: '#FFFFFF',
          '&:hover': {
            backgroundColor: '#0F766E',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
          border: '1px solid #E2E8F0',
        },
      },
    },
  },
});
