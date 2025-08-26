import React, { useState, useEffect, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import {
  Box, CssBaseline, Drawer, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Toolbar, AppBar, Typography, Button, CircularProgress,
  ThemeProvider, createTheme, Alert
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';

// Import icons for Admin App
import SettingsIcon from '@mui/icons-material/Settings';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ViewListIcon from '@mui/icons-material/ViewList';
import PrintIcon from '@mui/icons-material/Print';

// Eagerly load SignIn
import SignIn from './pages/Signin';

// Lazily load Admin components
const AddEvent = React.lazy(() => import('./pages/AddEvent'));
const EventView = React.lazy(() => import('./pages/EventView'));
const EditEvent = React.lazy(() => import('./pages/EditEvent'));
const Settings = React.lazy(() => import('./pages/Settings'));
const PrintDesigner = React.lazy(() => import('./pages/PrintDesigner'));

const drawerWidth = 240;
const theme = createTheme();

// =================================================================
// MAIN ADMIN APP COMPONENT
// =================================================================
function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    // Check for existing auth token on startup
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
        if (decodedUser.exp * 1000 > Date.now()) {
          setUser(decodedUser);
        } else {
          // Token expired, remove it
          localStorage.removeItem('authToken');
        }
      } catch (e) {
        localStorage.removeItem('authToken');
      }
    }
    setIsAuthLoading(false);
  }, []);

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

  if (isAuthLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  }

  // If no user, show the Sign In page for the central server
  if (!user) {
    return <SignIn onSignIn={handleSignIn} />;
  }

  // If user is not an admin, show an error and a logout button
  if (user.role !== 'admin') {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            <Alert severity="error">
                Access Denied. You must be an admin to use this application.
                <Button onClick={handleSignOut} sx={{ ml: 2 }} variant="outlined">Logout</Button>
            </Alert>
        </Box>
    );
  }
    
  const adminMenu = [
      { text: 'Event View', icon: <ViewListIcon />, path: '/events' },
      { text: 'Add Event', icon: <AddCircleOutlineIcon />, path: '/add-event' },
      { text: 'Print Designer', icon: <PrintIcon />, path: '/print-designer' },
      { text: 'User Settings', icon: <SettingsIcon />, path: '/settings' },
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
                              <Route path="/settings" element={<Settings user={user} />} />
                              <Route path="*" element={<Navigate to={dashboardPath} />} />
                          </Routes>
                      </Suspense>
                  </Box>
              </Box>
          </HashRouter>
      </ThemeProvider>
  );
}

export default App;
