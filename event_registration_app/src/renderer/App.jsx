// src/renderer/component/App.jsx
import React, { useState, useEffect, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import {
  Box, CssBaseline, Drawer, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, AppBar, Typography, Button, CircularProgress,
  ThemeProvider, createTheme, Alert
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';

// Import all necessary icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import CardMembershipIcon from '@mui/icons-material/CardMembership'; // Icon for Certificate

// Eagerly load components used in the setup flow
import SignIn from './components/Signin';
import Settings from './components/Settings';
import UserDashboard from './components/UserDashboard';
import ModeSelection from './components/ModeSelection';
import LocalDbSetup from './components/LocalDbSetup';
import ServerDbSetup from './components/ServerDbSetup';

// Lazily load main application components
const RegistrationForm = React.lazy(() => import('./components/RegistrationForm'));
const AllParticipants = React.lazy(() => import('./components/AllParticipants'));
const CheckInScanner = React.lazy(() => import('./components/CheckInScanner'));
const CertificateGenerator = React.lazy(() => import('./components/CertificateGenerator'));

const drawerWidth = 240;
const theme = createTheme();

// --- DEFINE ROLE-BASED MENUS ---
const adminMenu = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'All Participants', icon: <PeopleIcon />, path: '/participants' },
  { text: 'Certificate Generator', icon: <CardMembershipIcon />, path: '/certificate' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings', adminOnly: true },
];

const kioskMenu = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Register Participant', icon: <PersonAddIcon />, path: '/register' },
  { text: 'All Participants', icon: <PeopleIcon />, path: '/participants' },
  { text: 'Check-In Scanner', icon: <QrCodeScannerIcon />, path: '/checkin' },
  { text: 'Certificate Generator', icon: <CardMembershipIcon />, path: '/certificate' },
];


function App() {
  const [user, setUser] = useState(null);
  const [appStatus, setAppStatus] = useState('loading');
  const [dbSettings, setDbSettings] = useState(null);

  useEffect(() => {
    const checkInitialState = async () => {
      const config = await window.electronAPI.getConfig();
      if (config && config.mode) {
        setDbSettings(config);
        const token = localStorage.getItem('authToken');
        if (token) {
          try {
            const decodedUser = jwtDecode(token);
            if (decodedUser.exp * 1000 > Date.now()) {
              setUser(decodedUser);
              setAppStatus('dashboard');
            } else {
              localStorage.removeItem('authToken');
              setAppStatus('login');
            }
          } catch (e) {
            localStorage.removeItem('authToken');
            setAppStatus('login');
          }
        } else {
          setAppStatus('login');
        }
      } else {
        setAppStatus('mode');
      }
    };
    checkInitialState();
  }, []);

  const handleSignIn = (token) => {
    localStorage.setItem('authToken', token);
    setUser(jwtDecode(token));
    setAppStatus('dashboard');
  };

  const handleSignOut = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    setAppStatus('login');
  };

  const handleResetApp = async () => {
    localStorage.removeItem('authToken');
    await window.electronAPI.saveConfig({});
    setUser(null);
    setDbSettings(null);
    setAppStatus('mode');
  };

  const handleModeSelected = (mode) => {
    setAppStatus(mode === 'local' ? 'local' : 'server');
  };

  const handleSetupComplete = async (settings) => {
    setDbSettings(settings);
    try {
      if (settings.mode === 'local') {
        await window.electronAPI.createLocalDb(settings);
      } else {
        await window.electronAPI.createServerDb(settings);
      }
      await window.electronAPI.saveConfig(settings);
      setAppStatus('login');
    } catch (err) {
      console.error('Error during setup:', err);
      alert(`Failed to set up database: ${err.message}`);
    }
  };

  const handleGoBack = () => setAppStatus('mode');

  // --- Render logic for setup and login ---
  if (appStatus === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }
  if (appStatus === 'mode') return <ModeSelection onModeSelected={handleModeSelected} />;
  if (appStatus === 'local') return <LocalDbSetup onSetupComplete={handleSetupComplete} onGoBack={handleGoBack} />;
  if (appStatus === 'server') return <ServerDbSetup onSetupComplete={handleSetupComplete} onGoBack={handleGoBack} />;
  if (appStatus === 'login') return <SignIn onSignIn={handleSignIn} onResetApp={handleResetApp} />;


  // --- Main Application View ---
  if (appStatus === 'dashboard' && user) {
    // Determine which menu to show based on the user's role
    const menuItems = user.role === 'admin' ? adminMenu : kioskMenu;

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <HashRouter>
          <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
              <Toolbar>
                <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                  Kiosk Console ({user.username} - {user.role})
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
                  {menuItems.map(({ text, icon, path }) => (
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
                  <Route path="/participants" element={<AllParticipants user={user} />} />
                  <Route path="/certificate" element={<CertificateGenerator user={user} />} />

                  {/* Kiosk-only routes */}
                  {user.role === 'kiosk' && (
                    <>
                      <Route path="/register" element={<RegistrationForm user={user} />} />
                      <Route path="/checkin" element={<CheckInScanner user={user} />} />
                    </>
                  )}

                  {/* Admin-only routes */}
                  {user.role === 'admin' && (
                    <Route path="/settings" element={<Settings dbSettings={dbSettings} onResetApp={handleResetApp} />} />
                  )}
                  
                  {/* Fallback for any other path */}
                  <Route path="*" element={<Navigate to="/dashboard" />} />
                </Routes>
              </Suspense>
            </Box>
          </Box>
        </HashRouter>
      </ThemeProvider>
    );
  }

  // Fallback to the sign-in page if no other state matches
  return <SignIn onSignIn={handleSignIn} onResetApp={handleResetApp} />;
}

export default App;
