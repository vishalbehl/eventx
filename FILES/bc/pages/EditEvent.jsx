import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, TextField, Button, Typography, Paper, Alert, Grid,
  CircularProgress, Divider, IconButton, Stack, Snackbar,
  FormControl, InputLabel, Select, MenuItem, AppBar, Tabs, Tab,
  Table, TableContainer, TableHead, TableBody, TableRow, TableCell,
  Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  OutlinedInput, InputAdornment, Chip, RadioGroup, Radio, FormLabel, FormHelperText, Tooltip
} from '@mui/material';
import { useParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import * as XLSX from 'xlsx';
import { apiClient } from '../api/apiClient';
import { Country, State } from 'country-state-city';

// Helper components
function TabPanel(props) {
  const { children, value, index } = props;
  return <div role="tabpanel" hidden={value !== index}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const DEFAULT_ROLES = [
  { name: 'Delegate', code: 'DEL', isDefault: true, enabled: true },
  { name: 'Faculty', code: 'FAC', isDefault: true, enabled: true },
  { name: 'Organizer', code: 'ORG', isDefault: true, enabled: true },
  { name: 'Crew', code: 'CRW', isDefault: true, enabled: true },
  { name: 'VIP', code: 'VIP', isDefault: true, enabled: true }
];

const toDateInput = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : '';
const fromDateInput = (dateStr) => dateStr ? new Date(dateStr) : null;
function enumerateDatesInclusive(startISO, endISO) {
  if (!startISO || !endISO) return [];
  const dates = [];
  const start = new Date(startISO); start.setHours(0,0,0,0);
  const end = new Date(endISO); end.setHours(0,0,0,0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  return dates;
}

export default function EditEvent() {
  const { id } = useParams();

  // UI state
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const fileInputRef = useRef(null);

  // Core data
  const [form, setForm] = useState({
    country: 'IN', // default India
    state: '',
    is_ticketing_enabled: false
  });
  const [roles, setRoles] = useState(DEFAULT_ROLES);

  // Print settings
  const [printSettings, setPrintSettings] = useState({
    useSingleBadgeTemplate: true,
    singleBadgeTemplateId: '',
    badgeAssignments: {},
    useSingleCertTemplate: true,
    singleCertTemplateId: '',
    certAssignments: {}
  });
  const [templates, setTemplates] = useState([]);

  // Tickets / pricing
  const [ticketTiers, setTicketTiers] = useState(['Standard']);
  const [ticketPrices, setTicketPrices] = useState({});
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [newTierName, setNewTierName] = useState('');

  // Venues
  const [venues, setVenues] = useState([]);
  const [editingVenue, setEditingVenue] = useState(null);
  const [venueFormData, setVenueFormData] = useState({ name: '', address: '', date: '' });
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
  const [applyVenueToAllDates, setApplyVenueToAllDates] = useState(false);
  const [venueMode, setVenueMode] = useState('flex');

  // Halls & Sessions
  const [halls, setHalls] = useState([]);
  const [editingHall, setEditingHall] = useState(null);
  const [hallFormData, setHallFormData] = useState({ name: '', capacity: '' });
  const [isHallModalOpen, setIsHallModalOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedHallIdForSessions, setSelectedHallIdForSessions] = useState('');

  // System users / admins
  const [localAdminIds, setLocalAdminIds] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Fetch functions
  const fetchEventData = useCallback(async () => {
    try {
      const res = await apiClient.async_get(`/events/${id}`);
      if (res.success && res.details) {
        const { sessions: fSessions, roles: sRoles, print_settings: sPrint, local_admin_ids: sAdmins, ...eventDetails } = res.details;
        setForm(prev => ({
          ...prev,
          ...eventDetails,
          start_date: toDateInput(eventDetails.start_date),
          end_date: toDateInput(eventDetails.end_date),
          country: eventDetails.country || prev.country || 'IN',
          state: eventDetails.state || prev.state || ''
        }));
        setSessions((fSessions || []).map(s => ({ ...s, session_date: toDateInput(s.session_date) })));
        if (sRoles) setRoles(sRoles);
        if (sPrint) setPrintSettings(prev => ({ ...prev, ...sPrint }));
        if (sAdmins) setLocalAdminIds(sAdmins);
      } else {
        setError(res.message || 'Event not found');
      }
    } catch (err) {
      setError('Failed to load event data.');
      console.error(err);
    }
  }, [id]);

  const fetchSystemData = useCallback(async () => {
    try {
      const [templatesRes, usersRes] = await Promise.all([
        apiClient.async_get('/print-templates'),
        apiClient.async_get('/users')
      ]);
      if (templatesRes.success) setTemplates(templatesRes.templates || []);
      if (usersRes.success) setAllUsers((usersRes.users || []).filter(u => u.role !== 'admin'));
    } catch (err) {
      console.error('Failed to fetch system data', err);
    }
  }, []);

  const fetchHalls = useCallback(async () => {
    try {
      const res = await apiClient.async_get(`/events/${id}/halls`);
      if (res.success) setHalls(res.halls || []);
    } catch (err) { console.error('Failed to fetch halls', err); }
  }, [id]);

  const fetchVenues = useCallback(async () => {
    try {
      const res = await apiClient.async_get(`/events/${id}/venues`);
      if (res.success) setVenues(res.venues || []);
    } catch (err) { console.error('Failed to fetch venues', err); }
  }, [id]);

  const fetchEventPricing = useCallback(async () => {
    try {
      const res = await apiClient.async_get(`/events/${id}/pricing`);
      if (res.success && res.pricing) {
        const tiers = new Set(['Standard']);
        const prices = {};
        res.pricing.forEach(item => {
          tiers.add(item.tier_name);
          prices[`${item.role_name}_${item.tier_name}`] = item.price;
        });
        setTicketTiers(Array.from(tiers).sort());
        setTicketPrices(prices);
      }
    } catch (err) { console.error('Failed to load pricing data:', err); }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEventData(), fetchSystemData(), fetchEventPricing(), fetchHalls(), fetchVenues()])
      .catch((err) => {
        setError('An error occurred while loading event data.');
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [fetchEventData, fetchSystemData, fetchEventPricing, fetchHalls, fetchVenues]);

  // Generic handlers
  const handleTabChange = (e, v) => setActiveTab(v);
  const showSnackbar = (msg) => setSnackbar({ open: true, message: msg });

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = (type === 'checkbox') ? checked : value;
    setForm(prev => {
      const next = { ...prev, [name]: nextValue };
      if (name === 'country') next.state = ''; // reset state when country changes
      return next;
    });
  };

  // Roles
  const [newRoleName, setNewRoleName] = useState('');
  const handleAddRole = () => {
    if (!newRoleName) return;
    if (roles.find(r => r.name.toLowerCase() === newRoleName.toLowerCase())) return;
    setRoles(prev => [...prev, { name: newRoleName, code: newRoleName.substring(0,3).toUpperCase(), isDefault: false, enabled: true }]);
    setNewRoleName('');
  };
  const handleDeleteRole = (roleName) => setRoles(prev => prev.filter(r => r.name !== roleName));
  const handleRoleToggle = (roleName) => setRoles(prev => prev.map(r => r.name === roleName ? { ...r, enabled: !r.enabled } : r));

  // Print settings handlers
  const handlePrintSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPrintSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  const handleRoleTemplateChange = (roleName, templateType, templateId) => {
    const key = templateType === 'badge' ? 'badgeAssignments' : 'certAssignments';
    setPrintSettings(prev => ({ ...prev, [key]: { ...prev[key], [roleName]: templateId } }));
  };

  // Venues
  const handleOpenVenueModal = (venue = null) => {
    setEditingVenue(venue);
    setApplyVenueToAllDates(false);
    setVenueFormData(venue ? { ...venue, date: toDateInput(venue.date) } : { name: '', address: '', date: '' });
    setIsVenueModalOpen(true);
  };
  const handleCloseVenueModal = () => setIsVenueModalOpen(false);
  const handleVenueFormChange = (e) => setVenueFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSaveVenue = async () => {
    try {
      if (editingVenue) {
        const res = await apiClient.async_put(`/venues/${editingVenue.id}`, venueFormData);
        if (!res.success) throw new Error(res.message || 'Failed to update venue.');
        showSnackbar('Venue updated.');
      } else {
        if (applyVenueToAllDates) {
          const dates = enumerateDatesInclusive(form.start_date, form.end_date);
          if (!dates.length) throw new Error('Event dates not set.');
          for (const d of dates) {
            const payload = { ...venueFormData, date: d };
            const r = await apiClient.async_post(`/events/${id}/venues`, payload);
            if (!r.success) throw new Error(r.message || `Failed for ${d}`);
          }
          showSnackbar(`Venue created for ${dates.length} dates.`);
        } else {
          const res = await apiClient.async_post(`/events/${id}/venues`, venueFormData);
          if (!res.success) throw new Error(res.message || 'Failed to add venue.');
          showSnackbar('Venue added.');
        }
      }
      await fetchVenues();
      handleCloseVenueModal();
    } catch (err) {
      setError(err.message);
    }
  };
  const handleDeleteVenue = async (venueId) => {
    if (!window.confirm('Are you sure?')) return;
    const res = await apiClient.async_delete(`/venues/${venueId}`);
    if (res.success) { showSnackbar('Venue deleted.'); fetchVenues(); } else setError(res.message);
  };

  // Halls
  const handleOpenHallModal = (hall = null) => { setEditingHall(hall); setHallFormData(hall || { name: '', capacity: '' }); setIsHallModalOpen(true); };
  const handleCloseHallModal = () => setIsHallModalOpen(false);
  const handleHallFormChange = (e) => setHallFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSaveHall = async () => {
    try {
      const payload = { ...hallFormData };
      if (payload.capacity === '' || payload.capacity === null || payload.capacity === undefined) delete payload.capacity;
      let res;
      if (editingHall) res = await apiClient.async_put(`/halls/${editingHall.id}`, payload);
      else res = await apiClient.async_post(`/events/${id}/halls`, payload);
      if (!res.success) throw new Error(res.message || 'Failed to save hall.');
      showSnackbar('Hall saved.');
      await fetchHalls();
      handleCloseHallModal();
    } catch (err) { setError(err.message); }
  };
  const handleDeleteHall = async (hallId) => {
    if (!window.confirm('Are you sure?')) return;
    const res = await apiClient.async_delete(`/halls/${hallId}`);
    if (res.success) { showSnackbar('Hall deleted.'); fetchHalls(); } else setError(res.message);
  };

  // Sessions per-hall
  const filteredSessions = selectedHallIdForSessions ? sessions.filter(s => String(s.hall_id || '') === String(selectedHallIdForSessions)) : sessions;
  const handleSessionChange = (sessionId, field, value) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, [field]: value } : s));
  };
  const handleSaveSession = async (session) => {
    try {
      const payload = { ...session, eventId: id, hall_id: session.hall_id || selectedHallIdForSessions || null };
      const result = String(session.id).startsWith('new-') ? await apiClient.async_post('/sessions', payload) : await apiClient.async_put(`/sessions/${session.id}`, payload);
      if (!result.success) throw new Error(result.message || 'Failed to save session.');
      showSnackbar('Session saved!');
      await fetchEventData();
    } catch (err) { setError(err.message); }
  };
  const handleDeleteSession = async (sessionId) => {
    if (String(sessionId).startsWith('new-')) { setSessions(prev => prev.filter(s => s.id !== sessionId)); return; }
    if (!window.confirm('Delete session and its check-ins?')) return;
    const res = await apiClient.async_delete(`/sessions/${sessionId}`);
    if (res.success) { showSnackbar('Session deleted'); await fetchEventData(); } else setError(res.message);
  };
  const handleDeleteAllSessions = async () => {
    if (!window.confirm('Delete ALL sessions for this event?')) return;
    const res = await apiClient.async_delete(`/events/${id}/sessions`);
    if (res.success) { showSnackbar('All sessions deleted'); await fetchEventData(); } else setError(res.message);
  };

    const handleBulkUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const hallId = selectedHallIdForSessions;
    if (!hallId) { 
        setError('Select a hall for bulk upload.'); 
        e.target.value = ''; 
        return; 
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { 
            header: ['date', 'name'], 
            raw: false 
        });

        // ✅ Skip header row
        const toUpload = rows.slice(1).map(r => {
            // normalize date
            let isoDate = r.date;
            if (r.date) {
            const d = new Date(r.date);
            if (!isNaN(d)) {
                isoDate = d.toISOString().split('T')[0]; // YYYY-MM-DD
            }
            }

            return { 
            date: isoDate, 
            name: r.name, 
            hall_id: hallId, 
            max_checkins: 1,         // default
            allowed_roles: ['All']   // default
            };
        }).filter(x => x.date && x.name);

        console.log("Parsed rows from Excel:", rows);
        console.log("Sessions to upload (after defaults):", toUpload);

        const res = await apiClient.async_post('/sessions/bulk', { 
            eventId: id, 
            sessions: toUpload 
        });

        if (!res.success) throw new Error(res.message || 'Bulk upload failed.');
        showSnackbar(`Bulk upload: ${res.result.inserted.length} added.`);
        await fetchEventData();
        } catch (err) {
        setError(err.message);
        } finally { 
        e.target.value = ''; 
        }
    };

    reader.readAsBinaryString(file);
    };

  // Pricing
    const handlePriceChange = (roleName, tierName, price) => setTicketPrices(prev => ({ ...prev, [`${roleName}_${tierName}`]: price }));
    const handleAddTier = () => { if (!newTierName) return; if (!ticketTiers.includes(newTierName)) setTicketTiers(prev => [...prev, newTierName]); setNewTierName(''); setIsTierModalOpen(false); };

    const handleDeleteTier = async (tierToDelete) => {
        // 1. Create a new pricing object by filtering the *correct* state: ticketPrices
        const updatedTicketPrices = Object.entries(ticketPrices).reduce((acc, [key, value]) => {
        // A key is formatted like "Role_Tier". We only keep entries
        // where the tier part does NOT match the one we want to delete.
        if (!key.endsWith(`_${tierToDelete}`)) {
            acc[key] = value;
        }
        return acc;
        }, {});

        // 2. Optimistically update the UI state
        const previousPrices = ticketPrices;
        const previousTiers = ticketTiers;
        setTicketPrices(updatedTicketPrices);
        setTicketTiers(prev => prev.filter(t => t !== tierToDelete));

        try {
        // 3. Send the CORRECT filtered data to the backend
        const res = await apiClient.async_post(`/events/${id}/pricing`, { pricingData: updatedTicketPrices });

        if (!res.success) {
            throw new Error(res.message || "Failed to delete tier.");
        }
        showSnackbar(`Tier "${tierToDelete}" deleted.`);

        } catch (err) {
        setError(err.message);
        // If the API call fails, roll back the UI changes
        setTicketPrices(previousPrices);
        setTicketTiers(previousTiers);
        }
    };

  const handleEventUpdate = async () => {
    setLoading(true); setError('');
    try {
      if (form.is_ticketing_enabled) {
        const pricingRes = await apiClient.async_post(`/events/${id}/pricing`, { pricingData: ticketPrices });
        if (!pricingRes.success) throw new Error(pricingRes.message || 'Failed saving pricing');
      }
      const payload = { ...form, roles, print_settings: printSettings, local_admin_ids: localAdminIds };
      const res = await apiClient.async_put(`/events/${id}`, payload);
      if (!res.success) throw new Error(res.message || 'Failed to update event');
      showSnackbar('Event saved.');
      await fetchEventData();
    } catch (err) {
      setError(err.message);
      showSnackbar(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !form?.name) return <CircularProgress />;
  if (!form) return <Alert severity="error">{error || 'Could not load event.'}</Alert>;

  // Country/state lists
  const countries = Country.getAllCountries();
  const states = form?.country ? State.getStatesOfCountry(form.country) : [];

  // Renderers
    const renderGeneralTab = () => (
    <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Event Details</Typography>

        {/* Event Name */}
        <TextField
        sx={{ my: 1 }}
        label="Event Name"
        name="name"
        value={form?.name || ''}
        onChange={handleFormChange}
        fullWidth
        required
        />

        {/* Event Website */}
        <TextField
        sx={{ my: 1 }}
        label="Event Website"
        name="website"
        value={form?.website || 'https://www.'}
        onChange={handleFormChange}
        fullWidth
        />

        {/* Description */}
        <TextField
        sx={{ my: 1 }}
        label="Description"
        name="description"
        value={form?.description || ''}
        onChange={handleFormChange}
        fullWidth
        multiline
        rows={3}
        />

        {/* Country + State row */}
        <Stack direction="row" spacing={2} sx={{ my: 1 }}>
        <FormControl sx={{ flex: 1 }}>
            <InputLabel>Country</InputLabel>
            <Select
            name="country"
            value={form?.country || 'IN'}
            onChange={handleFormChange}
            fullWidth
            displayEmpty
            sx={{
                '& .MuiSelect-select': {
                width: '100%',
                minWidth: 'unset'
                }
            }}
            >
            {countries.map(c => (
                <MenuItem key={c.isoCode} value={c.isoCode}>
                {c.name}
                </MenuItem>
            ))}
            </Select>
        </FormControl>

        <FormControl sx={{ flex: 1 }}>
            <InputLabel>State</InputLabel>
            <Select
            name="state"
            value={form?.state || ''}
            onChange={handleFormChange}
            fullWidth
            displayEmpty
            sx={{
                '& .MuiSelect-select': {
                width: '100%',
                minWidth: 'unset'
                }
            }}
            >
            {states.map(s => (
                <MenuItem key={s.isoCode} value={s.name}>
                {s.name}
                </MenuItem>
            ))}
            </Select>
        </FormControl>
        </Stack>

        {/* Organiser Name */}
        <TextField
        sx={{ my: 1 }}
        label="Organiser Name"
        name="organiser_name"
        value={form?.organiser_name || ''}
        onChange={handleFormChange}
        fullWidth
        />

        {/* Organiser Phone + Email row */}
        <Stack direction="row" spacing={2} sx={{ my: 1 }}>
        <TextField
            label="Organiser Phone"
            name="organiser_phone"
            value={form?.organiser_phone || ''}
            onChange={handleFormChange}
            fullWidth
        />
        <TextField
            label="Organiser Email"
            name="organiser_email"
            type="email"
            value={form?.organiser_email || ''}
            onChange={handleFormChange}
            fullWidth
        />
        </Stack>

        {/* Start Date + End Date row */}
        <Stack direction="row" spacing={2} sx={{ my: 1 }}>
        <TextField
            label="Start Date"
            name="start_date"
            type="date"
            value={form?.start_date || ''}
            onChange={handleFormChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            required
        />
        <TextField
            label="End Date"
            name="end_date"
            type="date"
            value={form?.end_date || ''}
            onChange={handleFormChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            required
        />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Venues section */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Venues</Typography>
        <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => handleOpenVenueModal()}
        >
            Add Venue
        </Button>
        </Box>

        <TableContainer component={Paper} variant="outlined">
        <Table size="small">
            <TableHead>
            <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Address</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Actions</TableCell>
            </TableRow>
            </TableHead>
            <TableBody>
            {venues.length ? (
                venues.map(v => (
                <TableRow key={v.id}>
                    <TableCell>{v.name}</TableCell>
                    <TableCell>{v.address}</TableCell>
                    <TableCell>{toDateInput(v.date)}</TableCell>
                    <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenVenueModal(v)}>
                        <EditIcon />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteVenue(v.id)}>
                        <DeleteIcon />
                    </IconButton>
                    </TableCell>
                </TableRow>
                ))
            ) : (
                <TableRow>
                <TableCell colSpan={4} align="center">No venues yet</TableCell>
                </TableRow>
            )}
            </TableBody>
        </Table>
        </TableContainer>
    </Paper>
    );

    const renderRolesTab = () => (
        <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Participant Roles</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ my: 1 }}>
            <Table>
            <TableHead><TableRow><TableCell>Role</TableCell><TableCell>Code</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>
                {roles.map(r => <TableRow key={r.name} sx={{ opacity: r.enabled ? 1 : 0.5 }}>
                <TableCell>{r.name}</TableCell>
                <TableCell><code>{r.code}</code></TableCell>
                <TableCell align="right">
                    {r.isDefault ? <FormControlLabel control={<Switch checked={r.enabled} onChange={() => handleRoleToggle(r.name)} />} label="Enabled" />
                    : <IconButton color="error" onClick={() => handleDeleteRole(r.name)}><DeleteIcon /></IconButton>}
                </TableCell>
                </TableRow>)}
            </TableBody>
            </Table>
        </TableContainer>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <TextField size="small" label="New Role" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
            <Button variant="outlined" onClick={handleAddRole}>Add Role</Button>
        </Stack>
        </Paper>
    );

    const renderPrintSettingsTab = () => (
        <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Print Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure badge and certificate templates. You can use a single global template or assign per-role templates.
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
            control={<Switch name="useSingleBadgeTemplate" checked={!!printSettings.useSingleBadgeTemplate} onChange={handlePrintSettingChange} />}
            label="Use one badge template for all roles"
            />
            {printSettings.useSingleBadgeTemplate && (
            <FormControl sx={{ minWidth: 240 }}>
                <InputLabel>Badge Template</InputLabel>
                <Select name="singleBadgeTemplateId" label="Badge Template" value={printSettings.singleBadgeTemplateId || ''} onChange={handlePrintSettingChange}>
                <MenuItem value=""><em>None</em></MenuItem>
                {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                </Select>
                <FormHelperText>Select the template used to print badges for all roles.</FormHelperText>
            </FormControl>
            )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
            control={<Switch name="useSingleCertTemplate" checked={!!printSettings.useSingleCertTemplate} onChange={handlePrintSettingChange} />}
            label="Use one certificate template for all roles"
            />
            {printSettings.useSingleCertTemplate && (
            <FormControl sx={{ minWidth: 240 }}>
                <InputLabel>Certificate Template</InputLabel>
                <Select name="singleCertTemplateId" label="Certificate Template" value={printSettings.singleCertTemplateId || ''} onChange={handlePrintSettingChange}>
                <MenuItem value=""><em>None</em></MenuItem>
                {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                </Select>
                <FormHelperText>Select the template used to print certificates for all roles.</FormHelperText>
            </FormControl>
            )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ mb: 1 }}>Per-role template assignments (only used if "Use one ..." toggles are off)</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Assign badge/cert templates to each role individually.</Typography>

        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
            <TableHead>
                <TableRow><TableCell>Role</TableCell><TableCell>Badge Template</TableCell><TableCell>Certificate Template</TableCell></TableRow>
            </TableHead>
            <TableBody>
                {roles.map(r => (
                <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                    <FormControl fullWidth size="small">
                        <Select
                        value={printSettings.badgeAssignments?.[r.name] || ''}
                        onChange={(e) => handleRoleTemplateChange(r.name, 'badge', e.target.value)}
                        disabled={!!printSettings.useSingleBadgeTemplate}
                        >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.templateName}</MenuItem>)}
                        </Select>
                    </FormControl>
                    </TableCell>
                    <TableCell>
                    <FormControl fullWidth size="small">
                        <Select
                        value={printSettings.certAssignments?.[r.name] || ''}
                        onChange={(e) => handleRoleTemplateChange(r.name, 'cert', e.target.value)}
                        disabled={!!printSettings.useSingleCertTemplate}
                        >
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
        </Paper>
    );

    const renderSessionsTab = () => (
    <Paper sx={{ p: 2 }}>
        {/* Manage Halls Section */}
        <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Manage Halls</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenHallModal()}>
            Add Hall
            </Button>
        </Box>
        <TableContainer>
            <Table size="small">
            <TableHead>
                <TableRow>
                <TableCell>Hall</TableCell>
                <TableCell>Capacity</TableCell>
                <TableCell align="right">Actions</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {halls.length ? halls.map(h => (
                <TableRow key={h.id}>
                    <TableCell>{h.name}</TableCell>
                    <TableCell>{(h.capacity === null || h.capacity === undefined) ? 'Unlimited' : h.capacity}</TableCell>
                    <TableCell align="right">
                    <IconButton size="small" onClick={() => handleOpenHallModal(h)}><EditIcon /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteHall(h.id)}><DeleteIcon /></IconButton>
                    </TableCell>
                </TableRow>
                )) : (
                <TableRow>
                    <TableCell colSpan={3} align="center">No halls yet</TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </TableContainer>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Hall selection + bulk upload */}
        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Select Hall</InputLabel>
            <Select
            value={selectedHallIdForSessions}
            label="Select Hall"
            onChange={(e) => setSelectedHallIdForSessions(e.target.value)}
            >
            <MenuItem value=""><em>All Halls</em></MenuItem>
            {halls.map(h => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
            </Select>
        </FormControl>

        <Stack direction="row" spacing={1}>
            <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            size="small"
            disabled={!selectedHallIdForSessions}
            >
            Bulk Upload (current hall)
            <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} ref={fileInputRef} />
            </Button>
            <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            size="small"
            onClick={handleDeleteAllSessions}
            >
            Delete All
            </Button>
            <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="small"
            disabled={!selectedHallIdForSessions}
            onClick={() => {
                if (!selectedHallIdForSessions) return;
                const newId = `new-${Date.now()}`;
                setSessions(prev => [
                ...prev,
                {
                    id: newId,
                    event_id: id,
                    session_date: toDateInput(new Date()),
                    name: '',
                    max_checkins: 1,
                    hall_id: selectedHallIdForSessions,
                    allowed_roles: []
                }
                ]);
            }}
            >
            Add Session to Hall
            </Button>
        </Stack>
        </Stack>

        {/* Sessions List */}
        <Stack spacing={2}>
        {filteredSessions.length ? filteredSessions.map(session => (
            <Paper key={session.id} variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                label="Session Name"
                value={session.name}
                onChange={(e) => handleSessionChange(session.id, 'name', e.target.value)}
                size="small"
                sx={{ flex: 2 }}
                />
                <TextField
                type="date"
                label="Date"
                InputLabelProps={{ shrink: true }}
                value={session.session_date}
                onChange={(e) => handleSessionChange(session.id, 'session_date', e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                />
                <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Hall</InputLabel>
                <Select
                    value={session.hall_id || ''}
                    label="Hall"
                    onChange={(e) => handleSessionChange(session.id, 'hall_id', e.target.value)}
                >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {halls.map(h => <MenuItem key={h.id} value={h.id}>{h.name}</MenuItem>)}
                </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 2 }}>
                <InputLabel>Allowed Roles</InputLabel>
                <Select
                    multiple
                    value={session.allowed_roles || []}
                    onChange={(e) => handleSessionChange(session.id, 'allowed_roles', e.target.value)}
                    renderValue={(selected) => (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(selected || []).map(v => <Chip key={v} label={v} size="small" />)}
                    </Box>
                    )}
                >
                    {roles.filter(r => r.enabled).map(r => (
                    <MenuItem key={r.name} value={r.name}>{r.name}</MenuItem>
                    ))}
                </Select>
                </FormControl>
                <TextField
                label="Max Check-ins"
                type="number"
                value={session.max_checkins || 1}
                onChange={(e) => handleSessionChange(session.id, 'max_checkins', e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                />
                <Box sx={{ flexShrink: 0, display: 'flex', gap: 1 }}>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleSaveSession(session)}
                >
                    Save
                </Button>
                <IconButton color="error" onClick={() => handleDeleteSession(session.id)}>
                    <DeleteIcon />
                </IconButton>
                </Box>
            </Box>
            </Paper>
        )) : (
            <Typography variant="body2" color="text.secondary">
            No sessions for this selection.
            </Typography>
        )}
        </Stack>
    </Paper>
    );

  const renderTicketingTab = () => (
    <Paper sx={{ p: 2 }}>
      <FormControlLabel control={<Switch name="is_ticketing_enabled" checked={!!form.is_ticketing_enabled} onChange={handleFormChange} />} label="Enable Ticketing & Pricing" />
      <Divider sx={{ my: 2 }} />
      {form.is_ticketing_enabled && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Pricing Matrix</Typography>
            <Button variant="outlined" size="small" onClick={() => setIsTierModalOpen(true)}>Add Tier</Button>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell>Role</TableCell>{ticketTiers.map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {roles.filter(r => r.enabled).map(r => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    {ticketTiers.map(t => <TableCell key={t}><OutlinedInput size="small" startAdornment={<InputAdornment position="start">₹</InputAdornment>} value={ticketPrices[`${r.name}_${t}`] || ''} onChange={(e) => handlePriceChange(r.name, t, e.target.value)} /></TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Paper>
  );

return (
  <>
    <AppBar position="static" color="default">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flex: 1 }}
        >
          <Tab label="General" />
          <Tab label="Roles" />
          <Tab label="Print" />
          <Tab label="Halls & Sessions" />
          <Tab label="Ticketing" />
        </Tabs>

        <Button
          variant="contained"
          onClick={handleEventUpdate}
          disabled={loading}
          sx={{ ml: 2, whiteSpace: 'nowrap' }}
        >
          Save Event
        </Button>
      </Box>
    </AppBar>

    {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

    <TabPanel value={activeTab} index={0}>{renderGeneralTab()}</TabPanel>
    <TabPanel value={activeTab} index={1}>{renderRolesTab()}</TabPanel>
    <TabPanel value={activeTab} index={2}>{renderPrintSettingsTab()}</TabPanel>
    <TabPanel value={activeTab} index={3}>{renderSessionsTab()}</TabPanel>
    <TabPanel value={activeTab} index={4}>{renderTicketingTab()}</TabPanel>

      {/* Venue Modal */}
      <Dialog open={isVenueModalOpen} onClose={handleCloseVenueModal} fullWidth maxWidth="sm">
        <DialogTitle>{editingVenue ? 'Edit Venue' : 'Add Venue'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Venue Name" name="name" value={venueFormData.name} onChange={handleVenueFormChange} fullWidth />
            <TextField label="Address" name="address" value={venueFormData.address} onChange={handleVenueFormChange} fullWidth />
            <FormControlLabel control={<Switch checked={applyVenueToAllDates} onChange={(e) => setApplyVenueToAllDates(e.target.checked)} />} label="Apply to all event dates" />
            <TextField label="Date" type="date" name="date" value={venueFormData.date || ''} onChange={handleVenueFormChange} fullWidth InputLabelProps={{ shrink: true }} disabled={applyVenueToAllDates} />
            {!applyVenueToAllDates && <Typography variant="caption">Tip: toggle "Apply to all event dates" to create venues for every date in the event range.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseVenueModal}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveVenue}>{editingVenue ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Hall Modal */}
      <Dialog open={isHallModalOpen} onClose={handleCloseHallModal} fullWidth maxWidth="sm">
        <DialogTitle>{editingHall ? 'Edit Hall' : 'Add Hall'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Hall Name" name="name" value={hallFormData.name} onChange={handleHallFormChange} fullWidth />
            <TextField label="Capacity (leave blank for unlimited)" name="capacity" type="number" value={hallFormData.capacity} onChange={handleHallFormChange} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHallModal}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveHall}>{editingHall ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Tier Modal */}
    <Dialog open={isTierModalOpen} onClose={() => setIsTierModalOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Manage Price Tiers</DialogTitle>
        <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Tiers are the columns in your pricing matrix (e.g., Early Bird, VVIP).
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
                {ticketTiers.map(tier => (
                    <Paper key={tier} variant="outlined" sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ pl: 1 }}>{tier}</Typography>
                        {tier.toLowerCase() !== 'standard' && (
                            <Tooltip title="Delete Tier"><IconButton size="small" color="error" onClick={() => handleDeleteTier(tier)}><DeleteIcon /></IconButton></Tooltip>
                        )}
                    </Paper>
                ))}
            </Stack>
            <Divider sx={{ my: 3 }}>Add New Tier</Divider>
            <Stack direction="row" spacing={1}>
                <TextField label="New Tier Name" value={newTierName} onChange={(e) => setNewTierName(e.target.value)} size="small" fullWidth />
                <Button onClick={handleAddTier} variant="contained" startIcon={<AddIcon />}>Add</Button>
            </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setIsTierModalOpen(false)}>Done</Button></DialogActions>
    </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ open: false, message: '' })} message={snackbar.message} />
    </>
  );
}
