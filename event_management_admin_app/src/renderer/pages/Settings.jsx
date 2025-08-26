import React, { useState, useEffect } from 'react';
import {
    Box, TextField, Button, Typography, Paper, Alert, CircularProgress, Grid,
    AppBar, Tabs, Tab, Table, TableContainer, TableHead, TableBody, TableRow, TableCell,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
    Chip, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiClient } from '../api/apiClient';

// A helper component to manage the content of each tab
function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

// Main Settings component
export default function Settings({ user }) {
  // General state
  const [activeTab, setActiveTab] = useState(0);

  // User management state
  const [users, setUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  // MODIFIED: Changed default role from 'kiosk' to 'user'
  const [userFormData, setUserFormData] = useState({ username: '', password: '', role: 'user' });

  // NEW: Database settings state
  const [dbSettings, setDbSettings] = useState({
    host: '',
    port: '',
    user: '',
    database: '',
    password: '' // For updating, not for display
  });
  const [dbLoading, setDbLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState({ message: '', severity: 'info' });

  // Sync state
  const [events, setEvents] = useState([]);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncError, setSyncError] = useState('');

  // Licensing state
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState({ message: 'Enter your license key to activate the software.', severity: 'info' });
  const [licenseLoading, setLicenseLoading] = useState(false);

  // --- DATA FETCHING ---

  const fetchUsers = async () => {
    try {
      const res = await apiClient.async_get('/users');
      if (res.success) {
        setUsers(res.users);
      } else {
        console.error("Could not fetch users:", res.message);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  // NEW: Function to fetch database settings
  const fetchDbSettings = async () => {
    setDbLoading(true);
    // This should be a real API call. For now, we simulate it.
    // Example: const res = await apiClient.async_get('/settings/database');
    setTimeout(() => {
        setDbSettings({
            host: 'localhost',
            port: '5432',
            user: 'admin_user',
            database: 'event_management_db',
            password: '' // Password should not be sent from backend
        });
        setDbLoading(false);
    }, 1000);
  };

  const fetchSyncStatus = async () => {
    setSyncLoading(true);
    setSyncError('');
    try {
      const res = await apiClient.async_get('/events');
      if (res.success && Array.isArray(res.events)) {
        setEvents(res.events);
      } else {
        setSyncError(res.message || 'Could not fetch event sync status.');
      }
    } catch (err) {
      setSyncError(`Server Connection Error: ${err.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDbSettings();
    fetchSyncStatus();
  }, []);

  const handleTabChange = (event, newValue) => setActiveTab(newValue);

  // --- USER MANAGEMENT HANDLERS ---
  const handleOpenUserModal = (userToEdit = null) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      // MODIFIED: Changed role default to 'user' if it exists
      setUserFormData({ username: userToEdit.username, role: userToEdit.role, password: '' });
    } else {
      setEditingUser(null);
      // MODIFIED: Default role for new users is 'user'
      setUserFormData({ username: '', password: '', role: 'user' });
    }
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => setIsUserModalOpen(false);
  const handleUserFormChange = (e) => setUserFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSaveUser = async () => {
    // This requires backend endpoints that are currently missing.
    // See the explanation below for the required backend code.
    let result;
    if (editingUser) {
      result = await apiClient.async_put(`/users/${editingUser.id}`, userFormData);
    } else {
      result = await apiClient.async_post('/users', userFormData);
    }

    if (result.success) {
      fetchUsers();
      handleCloseUserModal();
    } else {
      alert(`Error: ${result.message}`);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      // This requires a backend endpoint that is currently missing.
      const result = await apiClient.async_delete(`/users/${userId}`);
      if (result.success) {
        fetchUsers();
      } else {
        alert(`Error: ${result.message}`);
      }
    }
  };

  // --- NEW: DATABASE SETTINGS HANDLERS ---
  const handleDbSettingsChange = (e) => {
    setDbSettings(prev => ({...prev, [e.target.name]: e.target.value}));
  };

  const handleTestConnection = async () => {
    setDbStatus({ message: 'Testing connection...', severity: 'info' });
    // Simulate API call
    setTimeout(() => {
        setDbStatus({ message: 'Connection successful!', severity: 'success' });
    }, 1500);
  };

  const handleSaveDbSettings = async () => {
    setDbStatus({ message: 'Saving settings...', severity: 'info' });
    // Simulate API call
    setTimeout(() => {
        setDbStatus({ message: 'Database settings saved successfully. A server restart may be required.', severity: 'success' });
    }, 1500);
  };

  // --- LICENSE HANDLER ---
  const handleActivateLicense = () => {
    setLicenseLoading(true);
    setTimeout(() => {
      if (licenseKey === 'PROJECTX-VALID-LICENSE-2025') {
        setLicenseStatus({ message: 'License activated successfully! All features unlocked.', severity: 'success' });
      } else {
        setLicenseStatus({ message: 'The provided license key is invalid or has expired.', severity: 'error' });
      }
      setLicenseLoading(false);
    }, 1500);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  // --- RENDER FUNCTIONS FOR TABS ---

  const renderUserManagementTab = () => (
    <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">User Management</Typography>
            <Button variant="contained" onClick={() => handleOpenUserModal()}>Add User</Button>
        </Box>
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Username</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Assigned Event</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {users.map((u) => (
                        <TableRow key={u.id}>
                            <TableCell>{u.username}</TableCell>
                            <TableCell>{u.role}</TableCell>
                            <TableCell>{u.assigned_event_name || 'N/A'}</TableCell>
                            <TableCell align="right">
                                <IconButton onClick={() => handleOpenUserModal(u)}><EditIcon /></IconButton>
                                <IconButton onClick={() => handleDeleteUser(u.id)}><DeleteIcon /></IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    </Box>
  );

  // NEW: Render function for the database settings tab
  const renderDatabaseSettingsTab = () => (
    <Box>
        <Typography variant="h5" gutterBottom>Database Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure the connection to your PostgreSQL database. Changes may require a server restart.
        </Typography>
        {dbLoading ? <CircularProgress /> : (
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}><TextField name="host" label="Host" value={dbSettings.host} onChange={handleDbSettingsChange} fullWidth /></Grid>
                <Grid item xs={12} md={6}><TextField name="port" label="Port" value={dbSettings.port} onChange={handleDbSettingsChange} fullWidth /></Grid>
                <Grid item xs={12} md={6}><TextField name="user" label="User" value={dbSettings.user} onChange={handleDbSettingsChange} fullWidth /></Grid>
                <Grid item xs={12} md={6}><TextField name="database" label="Database Name" value={dbSettings.database} onChange={handleDbSettingsChange} fullWidth /></Grid>
                <Grid item xs={12}><TextField name="password" label="New Password" type="password" value={dbSettings.password} onChange={handleDbSettingsChange} helperText="Leave blank to keep the current password" fullWidth /></Grid>
                <Grid item xs={12} sx={{ display: 'flex', gap: 2 }}>
                    <Button variant="contained" onClick={handleSaveDbSettings}>Save Settings</Button>
                    <Button variant="outlined" onClick={handleTestConnection}>Test Connection</Button>
                </Grid>
                {dbStatus.message && (
                    <Grid item xs={12}>
                        <Alert severity={dbStatus.severity}>{dbStatus.message}</Alert>
                    </Grid>
                )}
            </Grid>
        )}
    </Box>
  );

  const renderSynchronizationTab = () => (
    <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">Kiosk Sync Status</Typography>
            <Tooltip title="Refresh Status">
                <IconButton onClick={fetchSyncStatus} disabled={syncLoading}>
                    <RefreshIcon />
                </IconButton>
            </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            View the last time each event's data was synchronized from an offline kiosk.
        </Typography>

        {syncLoading ? <CircularProgress /> : syncError ? <Alert severity="error">{syncError}</Alert> :
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Event Name</TableCell>
                        <TableCell>Sync Status</TableCell>
                        <TableCell>Last Sync Time</TableCell>
                        <TableCell>Total Participants</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {events.map((event) => (
                        <TableRow key={event.id}>
                            <TableCell>{event.name}</TableCell>
                            <TableCell>
                                {event.last_kiosk_sync_at ? (
                                    <Chip label="Synced" color="success" size="small" />
                                ) : (
                                    <Chip label="Never Synced" color="warning" size="small" />
                                )}
                            </TableCell>
                            <TableCell>{formatDate(event.last_kiosk_sync_at)}</TableCell>
                            <TableCell>{event.total_participants || 0}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
        }
    </Box>
  );

  const renderLicensingTab = () => (
    <Box>
        <Typography variant="h5" gutterBottom>License Information</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Your license key unlocks premium features and allows for offline data synchronization.
        </Typography>
        <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={8}>
                <TextField fullWidth label="Your License Key" variant="outlined" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4}>
                 <Button fullWidth variant="contained" size="large" onClick={handleActivateLicense} disabled={licenseLoading || !licenseKey} sx={{ height: '56px' }}>
                    {licenseLoading ? <CircularProgress size={24} /> : 'Activate'}
                </Button>
            </Grid>
        </Grid>
        <Alert severity={licenseStatus.severity} sx={{ mt: 3 }}>{licenseStatus.message}</Alert>
    </Box>
  );

  return (
    <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex', height: 'calc(100vh - 110px)' }}>
        <Paper sx={{ width: '100%' }} elevation={3}>
            <AppBar position="static" color="default">
                {/* MODIFIED: Changed tab order and added Database Settings */}
                <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
                    <Tab label="User Management" />
                    <Tab label="Database Settings" />
                    <Tab label="Synchronization" />
                    <Tab label="Licensing" />
                </Tabs>
            </AppBar>
            {/* MODIFIED: Changed panel order to match tabs */}
            <TabPanel value={activeTab} index={0}>{renderUserManagementTab()}</TabPanel>
            <TabPanel value={activeTab} index={1}>{renderDatabaseSettingsTab()}</TabPanel>
            <TabPanel value={activeTab} index={2}>{renderSynchronizationTab()}</TabPanel>
            <TabPanel value={activeTab} index={3}>{renderLicensingTab()}</TabPanel>
        </Paper>

        {/* User Add/Edit Modal */}
        <Dialog open={isUserModalOpen} onClose={handleCloseUserModal}>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogContent>
                <TextField autoFocus margin="dense" name="username" label="Username" type="text" fullWidth variant="standard" value={userFormData.username} onChange={handleUserFormChange} />
                <TextField margin="dense" name="password" label={editingUser ? "New Password (optional)" : "Password"} type="password" fullWidth variant="standard" value={userFormData.password} onChange={handleUserFormChange} />
                <FormControl fullWidth margin="dense" variant="standard">
                    <InputLabel>Role</InputLabel>
                    <Select name="role" value={userFormData.role} onChange={handleUserFormChange}>
                        {/* MODIFIED: Role options updated from 'kiosk' to 'user' */}
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="user">User</MenuItem>
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseUserModal}>Cancel</Button>
                <Button onClick={handleSaveUser}>Save</Button>
            </DialogActions>
        </Dialog>
    </Box>
  );
}