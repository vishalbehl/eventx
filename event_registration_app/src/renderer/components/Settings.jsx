import React, { useState, useEffect } from 'react';
import {
    Box, TextField, Button, Typography, Paper, Alert, CircularProgress, Grid,
    AppBar, Tabs, Tab, Table, TableContainer, TableHead, TableBody, TableRow, TableCell,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
    Chip, Card, CardContent, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

function TabPanel({ children, value, index }) {
    return value === index ? <Box sx={{ p: 3 }}>{children}</Box> : null;
}

export default function Settings({ onConnect, isDbConnected }) {
    const [activeTab, setActiveTab] = useState(0);

    // Database Config State
    const [config, setConfig] = useState(null);
    const [dbStatus, setDbStatus] = useState({ msg: 'Current database connection settings.', sev: 'info' });
    const [dbLoading, setDbLoading] = useState(false);

    // Sync State  
    const [centralUrl, setCentralUrl] = useState(localStorage.getItem('centralServerUrl') || 'http://localhost:3001');
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState('');
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncStatus, setSyncStatus] = useState({ msg: 'Login to the central server to download event data.', sev: 'info' });
    const [connectionStatus, setConnectionStatus] = useState(null);

    // User Management State
    const [users, setUsers] = useState([]);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userFormData, setUserFormData] = useState({ username: '', password: '', role: 'kiosk' });
    const [userLoading, setUserLoading] = useState(false);
    const [userError, setUserError] = useState('');
    const [activeEventId, setActiveEventId] = useState(null);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const savedConfig = await window.electronAPI.getConfig();
                if (savedConfig) setConfig(savedConfig);

                const activeId = await window.electronAPI.getActiveEventId();
                if (activeId) setActiveEventId(activeId);
                
                // Check if already logged in by testing stored token
                const savedToken = localStorage.getItem('authToken');
                const savedUrl = localStorage.getItem('centralServerUrl');
                if (savedToken && savedUrl) {
                    setCentralUrl(savedUrl);
                    await attemptTokenLogin(savedToken, savedUrl);
                }
                
                if ((isDbConnected || savedConfig) && savedConfig?.mode) {
                    fetchUsers();
                }
            } catch (error) {
                console.error('Error loading initial data:', error);
                setDbStatus({ 
                    msg: `Failed to load configuration: ${error.message}`, 
                    sev: 'error' 
                });
            }
        };
        loadInitialData();
    }, [isDbConnected]);

    // Test existing token validity by fetching events
    const attemptTokenLogin = async (token, url) => {
        try {
            const result = await window.electronAPI.fetchCentralEvents({
                centralUrl: url,
                authToken: token
            });
            
            if (result.success) {
                setAvailableEvents(result.events || []);
                setIsLoggedIn(true);
                setSyncStatus({ 
                    msg: `Connected to central server. Found ${result.events?.length || 0} events.`, 
                    sev: 'success' 
                });
            } else {
                // Token is invalid, clear it
                localStorage.removeItem('authToken');
                throw new Error(result.message);
            }
        } catch (error) {
            console.log('Previous session expired:', error.message);
            setIsLoggedIn(false);
        }
    };

    // Test connection to central server
    const testCentralServerConnection = async () => {
        if (!centralUrl.trim()) {
            setConnectionStatus({
                success: false,
                message: 'Please enter a server URL',
                loading: false
            });
            return;
        }

        setConnectionStatus({ loading: true });
        
        const result = await window.electronAPI.testCentralServer(centralUrl);
        setConnectionStatus({
            success: result.success,
            message: result.message,
            loading: false
        });
    };

    const fetchUsers = async () => {
        setUserLoading(true);
        setUserError('');
        try {
            const result = await window.electronAPI.getUsers();
            if (result?.success) {
                setUsers(result.users || []);
            } else {
                setUserError(result.message || 'Failed to fetch users');
                console.error("Failed to fetch users:", result);
            }
        } catch (error) {
            setUserError(`Network error: ${error.message}`);
            console.error("Failed to fetch users:", error);
        } finally {
            setUserLoading(false);
        }
    };

    const handleTabChange = (_, newValue) => setActiveTab(newValue);
    
    const handleDbConfigChange = (e) => setConfig(prev => ({ 
        ...prev, 
        [e.target.name]: e.target.value 
    }));

    const handleDbSave = async (e) => {
        e.preventDefault();
        setDbLoading(true);
        setDbStatus({ msg: 'Saving configuration...', sev: 'info' });
        
        try {
            const saveResult = await window.electronAPI.saveConfig(config);
            if (!saveResult?.success) {
                throw new Error(saveResult?.error || 'Failed to save configuration');
            }

            let dbResult;
            if (config.mode === 'server') {
                dbResult = await window.electronAPI.createServerDb(config);
            } else {
                dbResult = await window.electronAPI.createLocalDb(config);
            }
            
            if (dbResult?.success) {
                setDbStatus({ msg: 'Database configuration saved and connected successfully!', sev: 'success' });
                if (onConnect) onConnect();
                setTimeout(() => fetchUsers(), 1000);
            } else {
                throw new Error(dbResult?.error || 'Failed to connect to database');
            }
        } catch (error) {
            console.error('Database save error:', error);
            setDbStatus({ 
                msg: `Failed to save configuration: ${error.message}`, 
                sev: 'error' 
            });
        } finally {
            setDbLoading(false);
        }
    };

    const handleLoginChange = (e) => setLoginForm(prev => ({ 
        ...prev, 
        [e.target.name]: e.target.value 
    }));

    const handleOnlineLogin = async () => {
        setSyncLoading(true);
        setLoginError('');
        
        try {
            // First test connection
            const connectionTest = await window.electronAPI.testCentralServer(centralUrl);
            if (!connectionTest.success) {
                throw new Error(`Cannot connect to central server: ${connectionTest.message}`);
            }

            // Attempt authentication
            const authResult = await window.electronAPI.authenticateCentralServer({
                centralUrl,
                username: loginForm.username,
                password: loginForm.password
            });

            if (!authResult.success) {
                throw new Error(authResult.message || 'Authentication failed');
            }

            // Store credentials
            localStorage.setItem('centralServerUrl', centralUrl);
            localStorage.setItem('authToken', authResult.token);

            // Fetch available events
            const eventsResult = await window.electronAPI.fetchCentralEvents({
                centralUrl,
                authToken: authResult.token
            });

            if (!eventsResult.success) {
                throw new Error(eventsResult.message || 'Failed to fetch events');
            }

            setAvailableEvents(eventsResult.events || []);
            setIsLoggedIn(true);
            setSyncStatus({ 
                msg: `Login successful! Found ${eventsResult.events?.length || 0} events.`, 
                sev: 'success' 
            });
            
        } catch (err) {
            console.error('Login error:', err);
            setLoginError(err.message);
            setSyncStatus({ msg: `Login failed: ${err.message}`, sev: 'error' });
        } finally {
            setSyncLoading(false);
        }
    };

    const handleEventSelection = (eventId) => {
        setSelectedEventId(eventId);
        const event = availableEvents.find(e => e.id === parseInt(eventId));
        setSelectedEvent(event);
    };

    const handleSeed = async () => {
        if (!selectedEventId) {
            return setSyncStatus({ msg: 'Please select an event first.', sev: 'warning' });
        }
        
        setSyncLoading(true);
        setSyncStatus({ msg: 'Downloading and seeding event data...', sev: 'info' });
        
        try {
            const authToken = localStorage.getItem('authToken');
            const result = await window.electronAPI.seedDatabaseFromCloud({ 
                authToken, 
                eventId: selectedEventId 
            });

            if (result?.success) {
                setSyncStatus({ 
                    msg: `Successfully seeded event data for "${result.eventName || 'Unknown Event'}"!`, 
                    sev: 'success' 
                });
                setTimeout(() => {
                    if (window.confirm('Data sync complete! The application needs to reload to apply changes. Reload now?')) {
                        window.location.reload();
                    }
                }, 1500);
            } else {
                throw new Error(result?.message || 'Unknown error');
            }
        } catch (error) {
            setSyncStatus({ msg: `Seeding failed: ${error.message}`, sev: 'error' });
        } finally {
            setSyncLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        setIsLoggedIn(false);
        setAvailableEvents([]);
        setSelectedEventId('');
        setSelectedEvent(null);
        setSyncStatus({ msg: 'Login to the central server to download event data.', sev: 'info' });
    };

    const handleRefreshEvents = async () => {
        setSyncLoading(true);
        try {
            const authToken = localStorage.getItem('authToken');
            const eventsResult = await window.electronAPI.fetchCentralEvents({
                centralUrl,
                authToken
            });

            if (eventsResult.success) {
                setAvailableEvents(eventsResult.events || []);
                setSyncStatus({ 
                    msg: `Refreshed! Found ${eventsResult.events?.length || 0} events.`, 
                    sev: 'success' 
                });
            } else {
                throw new Error(eventsResult.message || 'Failed to refresh events');
            }
        } catch (error) {
            setSyncStatus({ msg: `Failed to refresh events: ${error.message}`, sev: 'error' });
        } finally {
            setSyncLoading(false);
        }
    };

    const handleOpenUserModal = (user = null) => {
        setEditingUser(user);
        const formData = user 
            ? { 
                username: user.username, 
                role: user.role, 
                password: '', 
                assigned_event_id: user.assigned_event_id || activeEventId 
              }
            : { 
                username: '', 
                password: '', 
                role: 'kiosk', 
                assigned_event_id: activeEventId 
              };
        setUserFormData(formData);
        setIsUserModalOpen(true);
    };

    const handleCloseUserModal = () => {
        setIsUserModalOpen(false);
        setEditingUser(null);
        setUserFormData({ username: '', password: '', role: 'kiosk' });
    };

    const handleUserFormChange = (e) => setUserFormData(prev => ({ 
        ...prev, 
        [e.target.name]: e.target.value 
    }));

    const handleSaveUser = async () => {
        try {
            if (!userFormData.username.trim()) {
                alert('Username is required');
                return;
            }
            
            if (!editingUser && !userFormData.password.trim()) {
                alert('Password is required for new users');
                return;
            }

            const result = editingUser
                ? await window.electronAPI.updateUser(editingUser.id, userFormData)
                : await window.electronAPI.addUser(userFormData);
                
            if (result?.success) {
                fetchUsers();
                handleCloseUserModal();
            } else {
                alert(`Error: ${result?.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (window.confirm('Are you sure you want to delete this user?')) {
            try {
                const result = await window.electronAPI.deleteUser(userId);
                if (result?.success) {
                    fetchUsers();
                } else {
                    alert(`Error: ${result?.message || 'Failed to delete user'}`);
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        }
    };

    return (
        <Box>
            <AppBar position="static" color="default">
                <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
                    <Tab label="Database Connection" />
                    <Tab label="Data Synchronization" />
                    <Tab label="User Management" />
                </Tabs>
            </AppBar>

            <TabPanel value={activeTab} index={0}>
                <Typography variant="h5" gutterBottom>Database Configuration</Typography>
                <Alert severity={dbStatus.sev} sx={{ mb: 2 }}>{dbStatus.msg}</Alert>
                
                {!config ? (
                    <CircularProgress />
                ) : config.mode === 'local' ? (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography><strong>Mode:</strong> Local (SQLite)</Typography>
                        <Typography sx={{ mt: 1 }}><strong>Database File Path:</strong></Typography>
                        <TextField 
                            value={config.dbFilePath || config.folderPath || 'N/A'} 
                            fullWidth 
                            InputProps={{ readOnly: true }} 
                            sx={{ mt: 1 }} 
                        />
                    </Paper>
                ) : (
                    <form onSubmit={handleDbSave}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography><strong>Mode:</strong> Server ({config.dbType})</Typography>
                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                <Grid item xs={12} sm={8}>
                                    <TextField 
                                        name="host" 
                                        label="Host / IP Address" 
                                        value={config.host || ''} 
                                        onChange={handleDbConfigChange} 
                                        fullWidth 
                                        required 
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField 
                                        name="port" 
                                        label="Port" 
                                        type="number" 
                                        value={config.port || ''} 
                                        onChange={handleDbConfigChange} 
                                        fullWidth 
                                        required 
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField 
                                        name="dbName" 
                                        label="Database Name" 
                                        value={config.dbName || ''} 
                                        onChange={handleDbConfigChange} 
                                        fullWidth 
                                        required 
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField 
                                        name="user" 
                                        label="Database User" 
                                        value={config.user || ''} 
                                        onChange={handleDbConfigChange} 
                                        fullWidth 
                                        required 
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField 
                                        name="password" 
                                        label="Password" 
                                        type="password" 
                                        value={config.password || ''} 
                                        onChange={handleDbConfigChange} 
                                        fullWidth 
                                        required 
                                    />
                                </Grid>
                            </Grid>
                            <Button 
                                type="submit" 
                                variant="contained" 
                                size="large" 
                                fullWidth 
                                sx={{ mt: 3 }} 
                                disabled={dbLoading}
                            >
                                {dbLoading ? <CircularProgress size={24} /> : 'Update Configuration'}
                            </Button>
                        </Paper>
                    </form>
                )}
            </TabPanel>

            <TabPanel value={activeTab} index={1}>
                <Typography variant="h5" gutterBottom>Data Synchronization</Typography>
                <Alert severity={syncStatus.sev} sx={{ mb: 2 }}>{syncStatus.msg}</Alert>

                {!isLoggedIn ? (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>Connect to Central Server</Typography>
                        {loginError && <Alert severity="error" sx={{ mb: 2 }}>{loginError}</Alert>}
                        
                        {/* Connection Test Section */}
                        <Box sx={{ mb: 2 }}>
                            <TextField 
                                label="Central Server URL" 
                                fullWidth 
                                value={centralUrl} 
                                onChange={(e) => setCentralUrl(e.target.value)}
                                placeholder="http://localhost:3001"
                                helperText="Enter the URL of your central event management server"
                            />
                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    onClick={testCentralServerConnection}
                                    disabled={!centralUrl.trim() || connectionStatus?.loading}
                                >
                                    {connectionStatus?.loading ? <CircularProgress size={16} /> : 'Test Connection'}
                                </Button>
                                {connectionStatus && !connectionStatus.loading && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {connectionStatus.success ? (
                                            <>
                                                <CheckCircleIcon color="success" fontSize="small" />
                                                <Typography variant="body2" color="success.main">
                                                    Connected
                                                </Typography>
                                            </>
                                        ) : (
                                            <>
                                                <ErrorIcon color="error" fontSize="small" />
                                                <Typography variant="body2" color="error.main">
                                                    {connectionStatus.message}
                                                </Typography>
                                            </>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        {/* Login Form */}
                        <Typography variant="subtitle1" gutterBottom>Server Administrator Login</Typography>
                        <TextField 
                            name="username" 
                            label="Admin Username" 
                            value={loginForm.username}
                            onChange={handleLoginChange} 
                            fullWidth 
                            sx={{ mb: 1 }} 
                            autoComplete="username"
                        />
                        <TextField 
                            name="password" 
                            label="Admin Password" 
                            type="password" 
                            value={loginForm.password}
                            onChange={handleLoginChange} 
                            fullWidth 
                            sx={{ mb: 2 }} 
                            autoComplete="current-password"
                        />
                        <Button 
                            onClick={handleOnlineLogin} 
                            variant="contained" 
                            disabled={syncLoading || !loginForm.username || !loginForm.password || !centralUrl.trim()}
                            fullWidth
                            size="large"
                        >
                            {syncLoading ? (
                                <>
                                    <CircularProgress size={20} sx={{ mr: 1 }} />
                                    Connecting...
                                </>
                            ) : (
                                'Login & Fetch Events'
                            )}
                        </Button>
                    </Paper>
                ) : (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Available Events from Central Server</Typography>
                            <Box>
                                <Button 
                                    startIcon={<RefreshIcon />} 
                                    onClick={handleRefreshEvents} 
                                    disabled={syncLoading}
                                    sx={{ mr: 1 }}
                                    size="small"
                                >
                                    Refresh
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    color="secondary" 
                                    onClick={handleLogout}
                                    size="small"
                                >
                                    Logout
                                </Button>
                            </Box>
                        </Box>

                        {availableEvents.length === 0 ? (
                            <Alert severity="warning">
                                No events found on the central server. Make sure events are properly configured in your central system.
                            </Alert>
                        ) : (
                            <>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Found {availableEvents.length} event{availableEvents.length !== 1 ? 's' : ''} available for download
                                </Typography>

                                <FormControl fullWidth sx={{ mb: 2 }}>
                                    <InputLabel>Select Event to Download</InputLabel>
                                    <Select 
                                        value={selectedEventId} 
                                        onChange={(e) => handleEventSelection(e.target.value)}
                                        label="Select Event to Download"
                                    >
                                        {availableEvents.map(event => (
                                            <MenuItem key={event.id} value={event.id}>
                                                <Box sx={{ width: '100%' }}>
                                                    <Typography variant="subtitle1">{event.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        {event.start_date && event.end_date ? 
                                                            `${new Date(event.start_date).toLocaleDateString()} - ${new Date(event.end_date).toLocaleDateString()}` :
                                                            'Date not specified'
                                                        }
                                                    </Typography>
                                                    {event.organiser_name && (
                                                        <Typography variant="caption" color="text.secondary" display="block">
                                                            Organized by: {event.organiser_name}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {selectedEvent && (
                                    <Card sx={{ mb: 2 }} elevation={1}>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom color="primary">
                                                {selectedEvent.name}
                                            </Typography>
                                            {selectedEvent.description && (
                                                <Typography variant="body2" color="text.secondary" paragraph>
                                                    {selectedEvent.description}
                                                </Typography>
                                            )}
                                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                                {selectedEvent.start_date && (
                                                    <Chip 
                                                        label={`Start: ${new Date(selectedEvent.start_date).toLocaleDateString()}`} 
                                                        size="small" 
                                                        variant="outlined"
                                                    />
                                                )}
                                                {selectedEvent.end_date && (
                                                    <Chip 
                                                        label={`End: ${new Date(selectedEvent.end_date).toLocaleDateString()}`} 
                                                        size="small" 
                                                        variant="outlined"
                                                    />
                                                )}
                                                {selectedEvent.organiser_name && (
                                                    <Chip 
                                                        label={`Organizer: ${selectedEvent.organiser_name}`} 
                                                        size="small" 
                                                        variant="outlined"
                                                        color="secondary"
                                                    />
                                                )}
                                            </Box>
                                            {selectedEvent.organiser_email && (
                                                <Typography variant="caption" display="block" color="text.secondary">
                                                    Contact: {selectedEvent.organiser_email}
                                                    {selectedEvent.organiser_phone && ` • ${selectedEvent.organiser_phone}`}
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}

                                <Button 
                                    onClick={handleSeed} 
                                    variant="contained" 
                                    color="success" 
                                    size="large"
                                    fullWidth
                                    disabled={syncLoading || !selectedEventId}
                                    sx={{ mt: 2 }}
                                    startIcon={<CloudDownloadIcon />}
                                >
                                    {syncLoading ? (
                                        <>
                                            <CircularProgress size={20} sx={{ mr: 1 }} />
                                            Downloading Event Data...
                                        </>
                                    ) : (
                                        'Download & Seed Database'
                                    )}
                                </Button>

                                {selectedEventId && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                                        This will download all participants, sessions, and event configuration data.
                                    </Typography>
                                )}
                            </>
                        )}
                    </Paper>
                )}
            </TabPanel>

            <TabPanel value={activeTab} index={2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5">User Management</Typography>
                    <Button variant="contained" onClick={() => handleOpenUserModal()}>
                        Add User
                    </Button>
                </Box>
                
                {userError && <Alert severity="error" sx={{ mb: 2 }}>{userError}</Alert>}
                
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Username</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Assigned Kiosk</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {userLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} align="center">
                                        <Box sx={{ py: 2 }}>
                                            <CircularProgress />
                                            <Typography variant="body2" sx={{ mt: 1 }}>
                                                Loading users...
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} align="center">
                                        <Box sx={{ py: 4 }}>
                                            <Typography color="text.secondary" variant="h6" gutterBottom>
                                                {userError ? 'Failed to load users' : 'No users found'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {userError ? 
                                                    'There was an error loading user data from the database.' : 
                                                    'Create your first user to get started with the system.'
                                                }
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((u) => (
                                    <TableRow key={u.id} hover>
                                        <TableCell>
                                            <Typography variant="subtitle2">{u.username}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={u.role} 
                                                size="small" 
                                                color={u.role === 'admin' ? 'primary' : 'default'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {u.assigned_kiosk_name || 'Not assigned'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton 
                                                onClick={() => handleOpenUserModal(u)}
                                                size="small"
                                                title="Edit user"
                                            >
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton 
                                                onClick={() => handleDeleteUser(u.id)}
                                                size="small"
                                                title="Delete user"
                                                color="error"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TabPanel>

            <Dialog open={isUserModalOpen} onClose={handleCloseUserModal} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingUser ? `Edit User: ${editingUser.username}` : 'Add New User'}
                </DialogTitle>
                <DialogContent>
                    <TextField 
                        margin="dense" 
                        name="username" 
                        label="Username" 
                        fullWidth 
                        value={userFormData.username} 
                        onChange={handleUserFormChange}
                        required
                        sx={{ mb: 2 }}
                        autoComplete="username"
                    />
                    <TextField 
                        margin="dense" 
                        name="password" 
                        label="Password" 
                        type="password" 
                        fullWidth 
                        value={userFormData.password} 
                        onChange={handleUserFormChange} 
                        helperText={editingUser ? "Leave blank to keep current password" : "Required for new users"}
                        required={!editingUser}
                        sx={{ mb: 2 }}
                        autoComplete="new-password"
                    />
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel>Role</InputLabel>
                        <Select 
                            name="role" 
                            value={userFormData.role} 
                            onChange={handleUserFormChange}
                            label="Role"
                        >
                            <MenuItem value="kiosk">Kiosk User</MenuItem>
                            <MenuItem value="admin">Administrator</MenuItem>
                        </Select>
                    </FormControl>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {userFormData.role === 'admin' ? 
                            'Administrators can access all system features and manage settings.' :
                            'Kiosk users can only access participant check-in functions.'
                        }
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseUserModal}>Cancel</Button>
                    <Button onClick={handleSaveUser} variant="contained">
                        {editingUser ? 'Update User' : 'Create User'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}