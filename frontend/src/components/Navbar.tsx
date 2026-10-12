import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Container } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layers, LogOut, PlusCircle, LayoutDashboard } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <AppBar position="sticky" elevation={0} sx={{ backgroundColor: '#14243A', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ height: 68, display: 'flex', justifyContent: 'space-between' }}>
          
          {/* Logo & Brand */}
          <Box
            onClick={() => navigate('/')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.2,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                backgroundColor: '#16B8A6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(22, 184, 166, 0.35)',
              }}
            >
              <Layers size={22} strokeWidth={2.2} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                letterSpacing: 0.8,
                color: '#FFFFFF',
                fontSize: '1.35rem',
              }}
            >
              MAPORA<span style={{ color: '#16B8A6' }}>A</span>
            </Typography>
          </Box>

          {/* Navigation Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {user ? (
              <>
                <Button
                  onClick={() => navigate('/dashboard')}
                  startIcon={<LayoutDashboard size={17} />}
                  sx={{
                    color: isActive('/dashboard') ? '#16B8A6' : '#E2E8F0',
                    fontWeight: 500,
                    px: 1.8,
                    '&:hover': { color: '#16B8A6', backgroundColor: 'rgba(255,255,255,0.05)' },
                  }}
                >
                  Dashboard
                </Button>

                <Button
                  onClick={() => navigate('/projects/new')}
                  startIcon={<PlusCircle size={17} />}
                  variant="contained"
                  sx={{
                    backgroundColor: '#16B8A6',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    px: 2,
                    '&:hover': { backgroundColor: '#0F766E' },
                  }}
                >
                  Create Map
                </Button>

                <Box
                  sx={{
                    ml: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1.5,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                    <b style={{ color: '#F1F5F9' }}>{user.full_name || user.email}</b>
                  </Typography>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      backgroundColor: user.role === 'admin' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(22, 184, 166, 0.2)',
                      color: user.role === 'admin' ? '#F59E0B' : '#16B8A6',
                      border: `1px solid ${user.role === 'admin' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(22, 184, 166, 0.4)'}`
                    }}
                  >
                    {user.role}
                  </span>
                </Box>

                <Button
                  onClick={handleLogout}
                  startIcon={<LogOut size={16} />}
                  sx={{
                    color: '#94A3B8',
                    '&:hover': { color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' },
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => navigate('/login')}
                  sx={{
                    color: '#E2E8F0',
                    fontWeight: 500,
                    '&:hover': { color: '#16B8A6', backgroundColor: 'rgba(255,255,255,0.05)' },
                  }}
                >
                  Sign In
                </Button>
                <Button
                  onClick={() => navigate('/register')}
                  variant="contained"
                  sx={{
                    backgroundColor: '#16B8A6',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    '&:hover': { backgroundColor: '#0F766E' },
                  }}
                >
                  Get Started
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
