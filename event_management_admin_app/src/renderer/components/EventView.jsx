import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, CircularProgress, Alert, Grid, 
    Dialog, DialogActions, DialogContent, DialogTitle, DialogContentText,
    List, ListItem, ListItemButton, ListItemText, IconButton, ListItemIcon
} from '@mui/material';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '../apiClient';
import { findKiosksOnNetwork, pushEventToKiosk } from '../networkScanner';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
import RefreshIcon from '@mui/icons-material/Refresh';

export default function EventView({ user }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // State for the delete confirmation modal
    const [confirmDelete, setConfirmDelete] = useState(null);

    // State for the "Push to Kiosk" feature
    const [isPushModalOpen, setIsPushModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [discoveredKiosks, setDiscoveredKiosks] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [pushStatus, setPushStatus] = useState({ message: '', severity: 'info' });

    const fetchEvents = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await apiClient.async_get('/events');
            if (result.success && Array.isArray(result.events)) {
                setEvents(result.events);
            } else {
                setError(result.message || 'Could not fetch events from the central server.');
            }
        } catch(err) {
            setError(`Server Connection Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            const result = await apiClient.async_delete(`/events/${confirmDelete.id}`);
            if (result.success) {
                fetchEvents(); // Refresh list after delete
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch(err) {
            alert(`Server Connection Error: ${err.message}`);
        }
        setConfirmDelete(null); // Close the dialog
    };

    const handleOpenPushModal = (event) => {
        setSelectedEvent(event);
        setIsPushModalOpen(true);
        handleScanForKiosks();
    };

    const handleClosePushModal = () => {
        setIsPushModalOpen(false);
        setSelectedEvent(null);
        setDiscoveredKiosks([]);
        setPushStatus({ message: '', severity: 'info' });
    };

    const handleScanForKiosks = async () => {
        setIsScanning(true);
        setDiscoveredKiosks([]);
        const kiosks = await findKiosksOnNetwork();
        setDiscoveredKiosks(kiosks);
        setIsScanning(false);
    };

    const handleAssignEvent = async (kiosk) => {
        setIsScanning(true);
        setPushStatus({ message: `Assigning event to ${kiosk.name}...`, severity: 'info' });
        const result = await pushEventToKiosk(kiosk.ip, selectedEvent);
        if (result.success) {
            setPushStatus({ message: result.message, severity: 'success' });
        } else {
            setPushStatus({ message: result.message, severity: 'error' });
        }
        setIsScanning(false);
        setTimeout(handleClosePushModal, 2000);
    };
    
    const handleAudit = (event) => {
        const auditData = [
            { "Metric": "Event Name", "Value": getField(event, 'name') },
            { "Metric": "Date Range", "Value": `${formatDate(event.start_date)} - ${formatDate(event.end_date)}` },
            { "Metric": "Organiser", "Value": getField(event, 'organiser_name') },
            { "Metric": "Total Participants", "Value": getField(event, 'total_participants', 0) },
            { "Metric": "Online Participants", "Value": getField(event, 'online_participants', 0) },
            { "Metric": "Offline Participants", "Value": getField(event, 'offline_participants', 0) },
        ];
        const worksheet = XLSX.utils.json_to_sheet(auditData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Report");
        XLSX.writeFile(workbook, `Audit_Report_${getField(event, 'name', 'Event').replace(/ /g, "_")}.xlsx`);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('en-IN');
    };

    const getField = (obj, key, fallback = 'N/A') => obj?.[key] || fallback;

    if (loading) return <Box sx={{display: 'flex', justifyContent: 'center', mt: 4}}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Typography variant="h4" gutterBottom>Event Dashboard</Typography>
            <Grid container spacing={3}>
                {events.map(event => (
                    <Grid item key={event.id} xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Typography variant="h6" noWrap title={getField(event, 'name')}>
                                {getField(event, 'name')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ minHeight: '40px' }}>
                                {getField(event, 'description', 'No description')}
                            </Typography>
                            <Typography variant="caption" display="block">
                                {formatDate(event.start_date)} - {formatDate(event.end_date)}
                            </Typography>
                            
                            <Box sx={{ my: 2 }}>
                                <Typography variant="body1">Total Participants: <strong>{getField(event, 'total_participants', 0)}</strong></Typography>
                                <Typography variant="body2">Offline: <strong>{getField(event, 'offline_participants', 0)}</strong></Typography>
                                <Typography variant="body2">Online: <strong>{getField(event, 'online_participants', 0)}</strong></Typography>
                            </Box>

                            <Box sx={{ flexGrow: 1, my: 2, borderTop: '1px solid #eee', pt: 2 }}>
                                <Typography variant="subtitle2">Organiser Details:</Typography>
                                <Typography variant="body2"><strong>Name:</strong> {getField(event, 'organiser_name')}</Typography>
                                <Typography variant="body2"><strong>Phone:</strong> {getField(event, 'organiser_phone')}</Typography>
                                <Typography variant="body2"><strong>Email:</strong> {getField(event, 'organiser_email')}</Typography>
                            </Box>
                            <Box sx={{ flexGrow: 1, my: 2 }} />
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 'auto' }}>
                                <Button component={Link} to={`/events/edit/${event.id}`} variant="outlined" size="small">Edit</Button>
                                <Button variant="outlined" size="small" onClick={() => handleAudit(event)}>Audit</Button>
                                <Button variant="outlined" size="small" color="error" onClick={() => setConfirmDelete(event)}>
                                    Delete
                                </Button>
                            </Box>
                            <Box sx={{ flexGrow: 1, my: 1 }} />
                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 'auto' }}>
                                <Button variant="contained" size="small" startIcon={<SendToMobileIcon />} onClick={() => handleOpenPushModal(event)}>
                                    Push to Kiosk
                                </Button>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* --- "Push to Kiosk" Modal --- */}
            <Dialog open={isPushModalOpen} onClose={handleClosePushModal} fullWidth maxWidth="xs">
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Assign "{selectedEvent?.name}"
                    <IconButton onClick={handleScanForKiosks} disabled={isScanning}>
                        <RefreshIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {isScanning && <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /></Box>}
                    {!isScanning && discoveredKiosks.length === 0 && (
                        <Typography sx={{ my: 3, textAlign: 'center' }}>No kiosks found on the network.</Typography>
                    )}
                    {!isScanning && (
                        <List>
                            {discoveredKiosks.map(kiosk => (
                                <ListItemButton key={kiosk.id} onClick={() => handleAssignEvent(kiosk)}>
                                    <ListItemIcon><SendToMobileIcon /></ListItemIcon>
                                    <ListItemText primary={kiosk.name} secondary={kiosk.ip} />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                    <Box sx={{ minHeight: '40px', mt: 2 }}>
                        {pushStatus.message && <Alert severity={pushStatus.severity}>{pushStatus.message}</Alert>}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClosePushModal}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* --- "Delete Event" Confirmation Modal --- */}
            <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
                <DialogTitle>Delete Event?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the event <strong>{getField(confirmDelete, 'name')}</strong>? 
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}