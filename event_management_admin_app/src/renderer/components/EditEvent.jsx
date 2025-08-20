import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, TextField, Button, Typography, Paper, Alert, Grid,
    CircularProgress, Divider, IconButton, Stack, Snackbar,
    Tooltip, FormControl, InputLabel, Select, MenuItem, AppBar, Tabs, Tab,
    Chip, Table, TableContainer, TableHead, TableBody, TableRow, TableCell,
    Switch, FormControlLabel, OutlinedInput
} from '@mui/material';

import { useParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import * as XLSX from 'xlsx';
import { apiClient } from '../apiClient';

// A helper component to manage the content of each tab
function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} id={`event-tabpanel-${index}`}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

const DEFAULT_ROLES = [
  { name: 'Delegate', code: 'DEL', isDefault: true, enabled: true },
  { name: 'Faculty', code: 'FAC', isDefault: true, enabled: true },
  { name: 'Organizer', code: 'ORG', isDefault: true, enabled: true },
  { name: 'Crew', code: 'CRW', isDefault: true, enabled: true },
  { name: 'VIP', code: 'VIP', isDefault: true, enabled: true }
];

export default function EditEvent() {
    const { id } = useParams();

    // State
    const [activeTab, setActiveTab] = useState(0);
    const [form, setForm] = useState(null);
    const [roles, setRoles] = useState(DEFAULT_ROLES);
    const [newRoleName, setNewRoleName] = useState('');
    const [sessions, setSessions] = useState([]);
    const [printSettings, setPrintSettings] = useState({
        useSingleBadgeTemplate: true,
        singleBadgeTemplateId: '',
        badgeAssignments: {},
        useSingleCertTemplate: true,
        singleCertTemplateId: '',
        certAssignments: {}
    });
    const [localAdminIds, setLocalAdminIds] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    const fileInputRef = useRef(null);

    const toDateInput = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : '';

    // Data Fetching
    const fetchEventData = useCallback(async () => {
        try {
            const res = await apiClient.async_get(`/events/${id}`);
            if (res.success && res.details) {
                const { sessions: fSessions, roles: sRoles, print_settings: sPrint, local_admin_ids: sAdmins, ...eventDetails } = res.details;
                setForm({ ...eventDetails, start_date: toDateInput(eventDetails.start_date), end_date: toDateInput(eventDetails.end_date) });
                setSessions(fSessions.map(s => ({...s, session_date: toDateInput(s.session_date)})) || []);
                if (sRoles) setRoles(sRoles);
                if (sPrint) setPrintSettings(sPrint);
                if (sAdmins) setLocalAdminIds(sAdmins);
            } else { setError(res.message || 'Event not found'); }
        } catch (err) { setError('Failed to load event data.');
        } finally { setLoading(false); }
    }, [id]);

    const fetchSystemData = useCallback(async () => {
        const [templatesRes, usersRes] = await Promise.all([
            apiClient.async_get('/print-templates'),
            apiClient.async_get('/users')
        ]);
        if (templatesRes.success) setTemplates(templatesRes.templates || []);
        if (usersRes.success) setAllUsers(usersRes.users.filter(u => u.role !== 'admin') || []);
    }, []);

    useEffect(() => {
        fetchEventData();
        fetchSystemData();
    }, [fetchEventData, fetchSystemData]);

    // Handlers
    const handleTabChange = (event, newValue) => setActiveTab(newValue);
    const showSnackbar = (message) => setSnackbar({ open: true, message });
    const handleFormChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    // Role Management
    const handleAddRole = () => {
        if (newRoleName && !roles.find(r => r.name.toLowerCase() === newRoleName.toLowerCase())) {
            setRoles([...roles, { name: newRoleName, code: newRoleName.substring(0, 3).toUpperCase(), isDefault: false, enabled: true }]);
            setNewRoleName('');
        }
    };
    const handleDeleteRole = (roleNameToDelete) => setRoles(roles.filter(r => r.name !== roleNameToDelete));
    const handleRoleToggle = (roleName) => {
        setRoles(roles.map(r => r.name === roleName ? { ...r, enabled: !r.enabled } : r));
    };

    // Session Management
    const handleSessionChange = (index, field, value) => {
        const newSessions = [...sessions];
        newSessions[index][field] = value;
        setSessions(newSessions);
    };
    const handleSaveSession = async (session) => {
        try {
            const payload = { ...session, eventId: id };
            const result = String(session.id).startsWith('new-')
                ? await apiClient.async_post('/sessions', payload)
                : await apiClient.async_put(`/sessions/${session.id}`, payload);
            if (result.success) {
                showSnackbar('Session saved!');
                fetchEventData();
            } else { throw new Error(result.message); }
        } catch (err) { setError(`Failed to save session: ${err.message}`); }
    };
    const handleDeleteSession = async (sessionId) => {
        if (String(sessionId).startsWith('new-')) {
            setSessions(sessions.filter(s => s.id !== sessionId));
            return;
        }
        if (window.confirm('Are you sure? This will delete the session and all its check-in records.')) {
            try {
                const result = await apiClient.async_delete(`/sessions/${sessionId}`);
                if (result.success) {
                    showSnackbar('Session deleted!');
                    fetchEventData();
                } else { throw new Error(result.message); }
            } catch (err) { setError(`Failed to delete session: ${err.message}`); }
        }
    };
    const handleDeleteAllSessions = async () => {
        if (window.confirm('Are you sure you want to delete ALL sessions for this event? This cannot be undone.')) {
            try {
                const result = await apiClient.async_delete(`/events/${id}/sessions`);
                if (result.success) {
                    showSnackbar('All sessions deleted!');
                    fetchEventData();
                } else { throw new Error(result.message); }
            } catch (err) { setError(`Failed to delete all sessions: ${err.message}`); }
        }
    };
    const handleBulkUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: ['date', 'name'], raw: false });
                const sessionsToUpload = jsonData.slice(1).map(row => ({ date: row.date, name: row.name }));
                const result = await apiClient.async_post('/sessions/bulk', { eventId: id, sessions: sessionsToUpload });
                if(result.success) {
                    showSnackbar(`Bulk upload complete: ${result.result.inserted.length} added.`);
                    fetchEventData();
                } else { throw new Error(result.message); }
            } catch (err) { setError(`Bulk upload failed: ${err.message}`); }
        };
        reader.readAsBinaryString(file);
    };

    // Print Settings Management
    const handlePrintSettingChange = (e) => {
        const { name, value, checked, type } = e.target;
        setPrintSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    const handleRoleTemplateChange = (roleName, templateType, templateId) => {
        const key = templateType === 'badge' ? 'badgeAssignments' : 'certAssignments';
        setPrintSettings(prev => ({ ...prev, [key]: { ...prev[key], [roleName]: templateId } }));
    };

    // Main Save Handler
    const handleEventUpdate = async () => {
        setLoading(true);
        setError('');
        try {
            const payload = { ...form, roles, print_settings: printSettings, local_admin_ids: localAdminIds };
            const res = await apiClient.async_put(`/events/${id}`, payload);
            if (res.success) {
                showSnackbar('Event updated successfully!');
            } else { throw new Error(res.message); }
        } catch (err) { setError(`Error updating event: ${err.message}`);
        } finally { setLoading(false); }
    };

    if (loading && !form) return <CircularProgress />;
    if (!form) return <Alert severity="error">{error || 'Could not load event.'}</Alert>;

    // --- RENDER FUNCTIONS FOR TABS ---

    const renderGeneralTab = () => (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Event Details</Typography>
            <TextField sx={{mb:2}} label="Event Name" name="name" value={form.name || ''} onChange={handleFormChange} fullWidth required />
            <TextField sx={{mb:2}} label="Description" name="description" value={form.description || ''} onChange={handleFormChange} fullWidth multiline rows={3} />
            <TextField sx={{mt:2, mb:2}} label="Organiser Name" name="organiser_name" value={form.organiser_name || ''} onChange={handleFormChange} fullWidth />
            <TextField sx={{mb:2}} label="Organiser Phone" name="organiser_phone" value={form.organiser_phone || ''} onChange={handleFormChange} fullWidth />
            <TextField sx={{mb:2}} label="Organiser Email" type="email" name="organiser_email" value={form.organiser_email || ''} onChange={handleFormChange} fullWidth />
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}><TextField label="Start Date" type="date" name="start_date" value={form.start_date} onChange={handleFormChange} fullWidth InputLabelProps={{ shrink: true }} required /></Grid>
                <Grid item xs={12} sm={6}><TextField label="End Date" type="date" name="end_date" value={form.end_date} onChange={handleFormChange} fullWidth InputLabelProps={{ shrink: true }} required /></Grid>
            </Grid>
            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" gutterBottom>Local Admins / Kiosk Users</Typography>
            <FormControl fullWidth>
                <InputLabel>Assign Users</InputLabel>
                <Select
                    multiple
                    value={localAdminIds}
                    onChange={(e) => setLocalAdminIds(e.target.value)}
                    input={<OutlinedInput label="Assign Users" />}
                    renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {selected.map((id) => {
                                const user = allUsers.find(u => u.id === id);
                                return <Chip key={id} label={user ? user.username : id} />;
                            })}
                        </Box>
                    )}
                >
                    {allUsers.map((user) => (
                        <MenuItem key={user.id} value={user.id}>{user.username} ({user.role})</MenuItem>
                    ))}
                </Select>
            </FormControl>
        </Paper>
    );

    const renderRolesTab = () => (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Participant Roles</Typography>
            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Role Name</TableCell>
                            <TableCell>Code</TableCell>
                            <TableCell align="right">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {roles.map(role => (
                            <TableRow key={role.name} sx={{ opacity: role.enabled ? 1 : 0.4 }}>
                                <TableCell>{role.name}</TableCell>
                                <TableCell><code>{role.code}</code></TableCell>
                                <TableCell align="right">
                                    {role.isDefault ? (
                                        <FormControlLabel control={<Switch checked={role.enabled} onChange={() => handleRoleToggle(role.name)} />} label="Enabled" />
                                    ) : (
                                        <IconButton onClick={() => handleDeleteRole(role.name)} color="error"><DeleteIcon /></IconButton>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Stack direction="row" spacing={1} sx={{ mt: 3, pt: 3, borderTop: '1px solid #eee' }}>
                <TextField label="New Role Name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} size="small" />
                <Button onClick={handleAddRole} variant="outlined">Add Custom Role</Button>
            </Stack>
        </Paper>
    );

    const renderSessionsTab = () => (
        <Paper sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Manage Sessions</Typography>
                <Stack direction="row" spacing={1}>
                    <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} size="small">Bulk Upload<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} ref={fileInputRef} /></Button>
                    <Button variant="contained" color="error" startIcon={<DeleteIcon />} size="small" onClick={handleDeleteAllSessions}>Delete All</Button>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSessions([...sessions, {id: `new-${Date.now()}`, event_id: id, session_date: toDateInput(new Date()), name: '', max_checkins: 1}])} size="small">Add Session</Button>
                </Stack>
            </Stack>
            <Stack spacing={2}>
                {sessions.map((session, index) => (
                    <Stack direction="row" key={session.id} spacing={1.5} alignItems="center">
                        <TextField type="date" value={session.session_date} onChange={(e) => handleSessionChange(index, 'session_date', e.target.value)} size="small" sx={{width: 150}}/>
                        <TextField label="Session Name" value={session.name} onChange={(e) => handleSessionChange(index, 'name', e.target.value)} size="small" fullWidth/>
                        <TextField label="Max Check-ins" type="number" value={session.max_checkins || 1} onChange={(e) => handleSessionChange(index, 'max_checkins', e.target.value)} size="small" sx={{width: 120}}/>
                        <Button variant="outlined" size="small" onClick={() => handleSaveSession(session)}>Save</Button>
                        <IconButton color="error" onClick={() => handleDeleteSession(session.id)}><DeleteIcon /></IconButton>
                    </Stack>
                ))}
            </Stack>
        </Paper>
    );

    const renderPrintSettingsTab = () => (
        <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Badge Print Settings</Typography>
            <FormControlLabel control={<Switch name="useSingleBadgeTemplate" checked={printSettings.useSingleBadgeTemplate} onChange={handlePrintSettingChange} />} label="Use a single template for all roles" />
            {printSettings.useSingleBadgeTemplate ? (
                <FormControl fullWidth margin="normal">
                    <InputLabel>All Roles Badge Template</InputLabel>
                    <Select name="singleBadgeTemplateId" value={printSettings.singleBadgeTemplateId || ''} label="All Roles Badge Template" onChange={handlePrintSettingChange}>
                        {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                    </Select>
                </FormControl>
            ) : (
                <TableContainer component={Paper} variant="outlined" sx={{mt: 2}}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Badge Template</TableCell></TableRow></TableHead>
                        <TableBody>
                            {roles.filter(r => r.enabled).map(role => (
                                <TableRow key={role.name}>
                                    <TableCell>{role.name}</TableCell>
                                    <TableCell>
                                        <FormControl fullWidth size="small">
                                            <Select value={printSettings.badgeAssignments[role.name] || ''} onChange={(e) => handleRoleTemplateChange(role.name, 'badge', e.target.value)}>
                                                <MenuItem value=""><em>None</em></MenuItem>
                                                {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6" gutterBottom>Certificate Print Settings</Typography>
            <FormControlLabel control={<Switch name="useSingleCertTemplate" checked={printSettings.useSingleCertTemplate} onChange={handlePrintSettingChange} />} label="Use a single template for all roles" />
            {printSettings.useSingleCertTemplate ? (
                <FormControl fullWidth margin="normal">
                    <InputLabel>All Roles Certificate Template</InputLabel>
                    <Select name="singleCertTemplateId" value={printSettings.singleCertTemplateId || ''} label="All Roles Certificate Template" onChange={handlePrintSettingChange}>
                        {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                    </Select>
                </FormControl>
            ) : (
                 <TableContainer component={Paper} variant="outlined" sx={{mt: 2}}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Certificate Template</TableCell></TableRow></TableHead>
                        <TableBody>
                            {roles.filter(r => r.enabled).map(role => (
                                <TableRow key={role.name}>
                                    <TableCell>{role.name}</TableCell>
                                    <TableCell>
                                        <FormControl fullWidth size="small">
                                            <Select value={printSettings.certAssignments[role.name] || ''} onChange={(e) => handleRoleTemplateChange(role.name, 'cert', e.target.value)}>
                                                <MenuItem value=""><em>None</em></MenuItem>
                                                {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Paper>
    );

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb: 2}}>
                <Typography variant="h4">Manage Event: {form.name}</Typography>
                <Button variant="contained" color="primary" onClick={handleEventUpdate} disabled={loading}>
                    {loading ? <CircularProgress size={24} /> : 'Save All Changes'}
                </Button>
            </Stack>
            <AppBar position="static" color="default">
                <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
                    <Tab label="General & Users" />
                    <Tab label="Participant Roles" />
                    <Tab label="Sessions" />
                    <Tab label="Print Settings" />
                </Tabs>
            </AppBar>
            <TabPanel value={activeTab} index={0}>{renderGeneralTab()}</TabPanel>
            <TabPanel value={activeTab} index={1}>{renderRolesTab()}</TabPanel>
            <TabPanel value={activeTab} index={2}>{renderSessionsTab()}</TabPanel>
            <TabPanel value={activeTab} index={3}>{renderPrintSettingsTab()}</TabPanel>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({open: false, message: ''})} message={snackbar.message} />
        </Box>
    );
}
