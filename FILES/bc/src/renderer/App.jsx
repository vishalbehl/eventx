import React, { useState, useEffect, Suspense, useTransition } from 'react'; // 1. Import useTransition
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import {
  Box, CssBaseline, Drawer, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, AppBar, Typography, Button, CircularProgress,
  ThemeProvider, createTheme, Paper, Stack,Alert
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';

// Import icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ViewListIcon from '@mui/icons-material/ViewList';
import PrintIcon from '@mui/icons-material/Print';
import StorageIcon from '@mui/icons-material/Storage';
import DnsIcon from '@mui/icons-material/Dns';

// Eagerly load SignIn
import SignIn from './components/Signin';

// Lazily load all other components
const RegistrationForm = React.lazy(() => import('./components/RegistrationForm'));
const CheckInScanner = React.lazy(() => import('./components/CheckInScanner'));
const UserDashboard = React.lazy(() => import('./components/UserDashboard'));
const AllParticipants = React.lazy(() => import('./components/AllParticipants'));
const AddEvent = React.lazy(() => import('./components/AddEvent'));
const EventView = React.lazy(() => import('./components/EventView'));
const EditEvent = React.lazy(() => import('./components/EditEvent'));
const Settings = React.lazy(() => import('./components/Settings'));
const PrintDesigner = React.lazy(() => import('./components/PrintDesigner'));

const drawerWidth = 240;
const theme = createTheme();


// =================================================================
// MODE SELECTOR COMPONENT
// =================================================================
const ModeSelector = ({ onSelectMode }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', bgcolor: '#f5f5f5' }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h4" gutterBottom>Welcome!</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Please select how you want to use this application.
            </Typography>
            <Stack spacing={2}>
                <Button 
                    variant="contained" 
                    size="large" 
                    startIcon={<DnsIcon />} 
                    onClick={() => onSelectMode('central')}
                >
                    Manage Central Database (Admin)
                </Button>
                <Button 
                    variant="outlined" 
                    size="large" 
                    startIcon={<StorageIcon />} 
                    onClick={() => onSelectMode('kiosk')}
                >
                    Run Kiosk for an Event
                </Button>
            </Stack>
        </Paper>
    </Box>
);

// =================================================================
// MAIN APP COMPONENT
// =================================================================
function App() {
  const [appMode, setAppMode] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDbConnected, setIsDbConnected] = useState(false);
  
  // 2. Get the startTransition function from the hook
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const checkInitialStatus = async () => {
      if (appMode === 'kiosk' && window.electronAPI) {
        const result = await window.electronAPI.testDbConnection();
        setIsDbConnected(result.success);
      }

      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const decodedUser = jwtDecode(token);
          if (decodedUser.exp * 1000 > Date.now()) {
            setUser(decodedUser);
          } else {
            localStorage.removeItem('authToken');
          }
        } catch (e) {
          localStorage.removeItem('authToken');
        }
      }
      setIsAuthLoading(false);
    };
    checkInitialStatus();
  }, [appMode]);

  const handleSelectMode = (mode) => {
    // 3. Wrap the state update in startTransition
    startTransition(() => {
        setAppMode(mode);
    });
  };

  const handleChangeMode = () => {
      setUser(null);
      setAppMode(null);
      localStorage.removeItem('authToken');
  };

  const handleSignIn = (token) => {
    localStorage.setItem('authToken', token);
    const decodedUser = jwtDecode(token);
    setUser(decodedUser);
  };

  const handleSignOut = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  // --- RENDER LOGIC ---

  if (isAuthLoading || isPending) { // Show loading indicator during transition
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }

  if (!appMode) {
      return <ModeSelector onSelectMode={handleSelectMode} />;
  }

  // --- KIOSK MODE RENDER ---
  if (appMode === 'kiosk') {
    if (!isDbConnected) {
      return (
          <ThemeProvider theme={theme}>
              <CssBaseline />
              <Settings onConnect={() => setIsDbConnected(true)} isDbConnected={isDbConnected} onChangeMode={handleChangeMode} />
          </ThemeProvider>
      );
    }
    if (!user) {
      return <SignIn onSignIn={handleSignIn} isKioskMode={true} onChangeMode={handleChangeMode} />;
    }

    const kioskMenu = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'Register Participant', icon: <PersonAddIcon />, path: '/register' },
        { text: 'All Participants', icon: <PeopleIcon />, path: '/participants' },
        { text: 'Check-In Scanner', icon: <QrCodeScannerIcon />, path: '/checkin' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    ];
    const dashboardPath = '/dashboard';

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <HashRouter>
                <Box sx={{ display: 'flex' }}>
                    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                        <Toolbar>
                            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                                Kiosk Mode ({user.username})
                            </Typography>
                            <Button color="inherit" onClick={handleSignOut}>Logout</Button>
                            <Button color="inherit" onClick={handleChangeMode}>Change Mode</Button>
                        </Toolbar>
                    </AppBar>
                    <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' } }}>
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
                                <Route path="/" element={<Navigate to={dashboardPath} />} />
                                <Route path="/dashboard" element={<UserDashboard user={user} />} />
                                <Route path="/register" element={<RegistrationForm user={user} />} />
                                <Route path="/participants" element={<AllParticipants user={user} />} />
                                <Route path="/checkin" element={<CheckInScanner user={user} />} />
                                <Route path="/settings" element={<Settings onConnect={() => setIsDbConnected(true)} isDbConnected={isDbConnected} user={user} onChangeMode={handleChangeMode} />} />
                                <Route path="*" element={<Navigate to={dashboardPath} />} />
                            </Routes>
                        </Suspense>
                    </Box>
                </Box>
            </HashRouter>
        </ThemeProvider>
    );
  }

  // --- CENTRAL ADMIN MODE RENDER ---
  if (appMode === 'central') {
    if (!user) {
        return <SignIn onSignIn={handleSignIn} isKioskMode={false} onChangeMode={handleChangeMode} />;
    }
    if (user.role !== 'admin') {
        return <Alert severity="error">Access Denied. You must be an admin to manage the central database. <Button onClick={handleChangeMode}>Change Mode</Button></Alert>
    }
    
    const adminMenu = [
        { text: 'Event View', icon: <ViewListIcon />, path: '/events' },
        { text: 'Add Event', icon: <AddCircleOutlineIcon />, path: '/add-event' },
        { text: 'Print Designer', icon: <PrintIcon />, path: '/print-designer' },
        { text: 'Admin Settings', icon: <SettingsIcon />, path: '/settings' },
    ];
    const dashboardPath = '/events';

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <HashRouter>
                <Box sx={{ display: 'flex' }}>
                    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                        <Toolbar>
                            <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
                                Central Admin ({user.username})
                            </Typography>
                            <Button color="inherit" onClick={handleSignOut}>Logout</Button>
                            <Button color="inherit" onClick={handleChangeMode}>Change Mode</Button>
                        </Toolbar>
                    </AppBar>
                    <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' } }}>
                        <Toolbar />
                        <Box sx={{ overflow: 'auto' }}>
                            <List>
                                {adminMenu.map(({ text, icon, path }) => (
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
                                <Route path="/" element={<Navigate to={dashboardPath} />} />
                                <Route path="/events" element={<EventView user={user} />} />
                                <Route path="/add-event" element={<AddEvent user={user} />} />
                                <Route path="/events/edit/:id" element={<EditEvent user={user} />} />
                                <Route path="/print-designer" element={<PrintDesigner user={user} />} />
                                <Route path="/settings" element={<Settings isKioskMode={false} user={user} onChangeMode={handleChangeMode} />} />
                                <Route path="*" element={<Navigate to={dashboardPath} />} />
                            </Routes>
                        </Suspense>
                    </Box>
                </Box>
            </HashRouter>
        </ThemeProvider>
    );
  }
}

export default App;
