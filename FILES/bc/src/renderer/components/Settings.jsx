import React, { useState, useEffect } from 'react';
import { 
    Box, TextField, Button, Typography, Paper, Alert, CircularProgress, Grid,
    AppBar, Tabs, Tab, Table, TableContainer, TableHead, TableBody, TableRow, TableCell,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { apiClient } from '../apiClient';   // ✅ use central DB API

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
  // Database config state (kept if you still want to show DB tab)
  const [config, setConfig] = useState({
    dbHost: 'localhost',
    dbPort: 5432,
    dbUser: '',
    dbPassword: '',
    dbDatabase: ''
  });
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [dbSuccess, setDbSuccess] = useState('');
  
  // Sync state
  const [syncStatus, setSyncStatus] = useState('Idle');
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // User management state
  const [users, setUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ username: '', password: '', role: 'kiosk' });

  // General state
  const [activeTab, setActiveTab] = useState(0);

  // Load users from central DB
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

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleTabChange = (event, newValue) => setActiveTab(newValue);

  // Database config tab handlers (optional if you don’t need them)
  const handleDbConfigChange = (e) => setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleDbSave = async (e) => {
    e.preventDefault();
    setDbLoading(true);
    setDbError('');
    setDbSuccess('');
    try {
      // Here you can test connection if needed
      setDbSuccess('Configuration saved! (Central DB is used directly)');
    } catch (err) {
      setDbError(`Connection Failed: ${err.message}`);
    } finally {
      setDbLoading(false);
    }
  };

  // Sync handlers (still dummy since central API handles this)
  const handleSeed = async () => {
    setSyncStatus('Seeding from cloud...');
    setTimeout(() => {
      setSyncStatus('Seeding successful!');
      setLastSyncTime(new Date().toLocaleString());
    }, 1000);
  };

  const handleSync = async () => {
    setSyncStatus('Syncing changes...');
    setTimeout(() => {
      setSyncStatus('Sync successful!');
      setLastSyncTime(new Date().toLocaleString());
    }, 1000);
  };

  // User management handlers
  const handleOpenUserModal = (userToEdit = null) => {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setUserFormData({ username: userToEdit.username, role: userToEdit.role, password: '' });
    } else {
      setEditingUser(null);
      setUserFormData({ username: '', password: '', role: 'kiosk' });
    }
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => setIsUserModalOpen(false);

  const handleUserFormChange = (e) => setUserFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSaveUser = async () => {
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
      const result = await apiClient.async_delete(`/users/${userId}`);
      if (result.success) {
        fetchUsers();
      } else {
        alert(`Error: ${result.message}`);
      }
    }
  };

  // Render tabs
  const renderDatabaseConfigTab = () => (
    <Box>
        <Typography variant="h5" gutterBottom>Database Connection</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Central DB is used. You can still edit config below if required.
        </Typography>
        
        {dbError && <Alert severity="error" sx={{ mb: 2 }}>{dbError}</Alert>}
        {dbSuccess && <Alert severity="success" sx={{ mb: 2 }}>{dbSuccess}</Alert>}

        <form onSubmit={handleDbSave}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField name="dbHost" label="Server Host / IP Address" value={config.dbHost} onChange={handleDbConfigChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField name="dbPort" label="Port" type="number" value={config.dbPort} onChange={handleDbConfigChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="dbDatabase" label="Database Name" value={config.dbDatabase} onChange={handleDbConfigChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="dbUser" label="Database User" value={config.dbUser} onChange={handleDbConfigChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="dbPassword" label="Password" type="password" value={config.dbPassword} onChange={handleDbConfigChange} fullWidth />
            </Grid>
          </Grid>
          
          <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }} disabled={dbLoading}>
            {dbLoading ? <CircularProgress size={24} /> : 'Save Configuration'}
          </Button>
        </form>
    </Box>
  );

  const renderSynchronizationTab = () => (
    <Box>
        <Typography variant="h5" gutterBottom>Data Synchronization</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Manually sync data between kiosk and cloud (demo).
        </Typography>
        <Grid container spacing={3} alignItems="center">
            <Grid item>
                <Button variant="contained" startIcon={<CloudDownloadIcon />} onClick={handleSeed}>
                    Seed from Cloud
                </Button>
            </Grid>
            <Grid item>
                <Button variant="contained" startIcon={<SyncIcon />} onClick={handleSync}>
                    Sync Changes
                </Button>
            </Grid>
            <Grid item>
                <Typography>Status: <strong>{syncStatus}</strong></Typography>
                {lastSyncTime && <Typography variant="caption">Last successful sync: {lastSyncTime}</Typography>}
            </Grid>
        </Grid>
    </Box>
  );

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
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {users.map((u) => (
                        <TableRow key={u.id}>
                            <TableCell>{u.username}</TableCell>
                            <TableCell>{u.role}</TableCell>
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

  return (
    <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex', height: 'calc(100vh - 64px)' }}>
        <Paper sx={{ width: '100%' }}>
            <AppBar position="static" color="default">
                <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
                    <Tab label="Database" />
                    <Tab label="Synchronization" />
                    <Tab label="User Management" />
                    <Tab label="Licensing" />
                </Tabs>
            </AppBar>
            <TabPanel value={activeTab} index={0}>{renderDatabaseConfigTab()}</TabPanel>
            <TabPanel value={activeTab} index={1}>{renderSynchronizationTab()}</TabPanel>
            <TabPanel value={activeTab} index={2}>{renderUserManagementTab()}</TabPanel>
            <TabPanel value={activeTab} index={3}>
                <Typography variant="h5">License Information</Typography>
                <Typography>Details about the license key and activation will go here.</Typography>
            </TabPanel>
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
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="kiosk">Kiosk</MenuItem>
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
