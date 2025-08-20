// src/renderer/component/App.jsx
import React, { useState, useEffect, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import {
  Box, CssBaseline, Drawer, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, AppBar, Typography, Button, CircularProgress,
  ThemeProvider, createTheme, Alert
} from '@mui/material';
import {jwtDecode} from 'jwt-decode';

import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';

import SignIn from './components/Signin';
import Settings from './components/Settings';
import UserDashboard from './components/UserDashboard';
import ModeSelection from './components/ModeSelection';
import LocalDbSetup from './components/LocalDbSetup';
import ServerDbSetup from './components/ServerDbSetup';

const RegistrationForm = React.lazy(() => import('./components/RegistrationForm'));
const CheckInScanner = React.lazy(() => import('./components/CheckInScanner'));
const AllParticipants = React.lazy(() => import('./components/AllParticipants'));

const drawerWidth = 240;
const theme = createTheme();

function App() {
  const [user, setUser] = useState(null);
  const [setupStep, setSetupStep] = useState('mode'); 
  const [dbSettings, setDbSettings] = useState(null);

  const checkDatabaseSetup = async () => {
    if (!window.electronAPI || !window.electronAPI.isDatabaseSeeded) return;
    try {
      const seeded = await window.electronAPI.isDatabaseSeeded();
      if (seeded) {
        const token = localStorage.getItem('authToken');
        if (token) setUser(jwtDecode(token));
        setSetupStep('login');
      } else {
        setSetupStep('mode');
      }
    } catch (err) {
      console.error('Database check failed:', err);
      setSetupStep('mode');
    }
  };

  useEffect(() => {
    checkDatabaseSetup();
  }, []);

  const handleSignIn = (token) => {
    localStorage.setItem('authToken', token);
    setUser(jwtDecode(token));
    setSetupStep('dashboard');
  };

  const handleSignOut = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    setSetupStep('login');
  };

  const handleModeSelected = (mode) => {
    setSetupStep(mode === 'local' ? 'local' : 'server');
  };


  const handleSetupComplete = async (settings) => {
    setDbSettings(settings);
    try {
      if (settings.mode === 'local') {
        await window.electronAPI.createLocalDb(settings);
      } else {
        await window.electronAPI.createServerDb(settings);
      }
      
      // Add this line to save the configuration persistently
      await window.electronAPI.saveConfig(settings);
      
      setSetupStep('login');
    } catch (err) {
      console.error('Error creating database tables:', err);
      alert('Failed to create database tables. Check console.');
    }
  };

  const handleGoBack = () => setSetupStep('mode');

  // --- Setup flow ---
  if (setupStep === 'mode') return <ModeSelection onModeSelected={handleModeSelected} />;
  if (setupStep === 'local') return <LocalDbSetup onSetupComplete={handleSetupComplete} onGoBack={handleGoBack} />;
  if (setupStep === 'server') return <ServerDbSetup onSetupComplete={handleSetupComplete} onGoBack={handleGoBack} />;
  if (setupStep === 'login') return <SignIn onSignIn={handleSignIn} dbSettings={dbSettings} />;

  if (!user) return <CircularProgress />;

  const kioskMenu = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Register Participant', icon: <PersonAddIcon />, path: '/register' },
    { text: 'All Participants', icon: <PeopleIcon />, path: '/participants' },
    { text: 'Check-In Scanner', icon: <QrCodeScannerIcon />, path: '/checkin' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <Box sx={{ display: 'flex' }}>
          <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
            <Toolbar>
              <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                Local Admin Console ({user.username})
              </Typography>
              <Button color="inherit" onClick={handleSignOut}>Logout</Button>
            </Toolbar>
          </AppBar>

          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
            }}
          >
            <Toolbar />
            <Box sx={{ overflow: 'auto' }}>
              <List>
                {kioskMenu.map(({ text, icon, path }) => (
                  <ListItem key={text} disablePadding>
                    <ListItemButton component={Link} to={path}>
                      <ListItemIcon>{icon}</ListItemIcon>
                      <ListItemText primary={text} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Drawer>

          <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
            <Toolbar />
            <Suspense fallback={<CircularProgress />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<UserDashboard user={user} />} />
                <Route path="/register" element={<RegistrationForm user={user} />} />
                <Route path="/participants" element={<AllParticipants user={user} />} />
                <Route path="/checkin" element={<CheckInScanner user={user} />} />
                <Route path="/settings" element={<Settings dbSettings={dbSettings} />} />
                <Route path="*" element={<Alert severity="error">Page not found</Alert>} />
              </Routes>
            </Suspense>
          </Box>
        </Box>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
