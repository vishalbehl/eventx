import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, CircularProgress, Alert, Grid, 
    Dialog, DialogActions, DialogContent, DialogTitle, DialogContentText 
} from '@mui/material';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { apiClient } from '../apiClient'; // Use the central server client

export default function EventView({ user }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);

    const fetchEvents = async () => {
        setLoading(true);
        setError('');
        try {
            // --- REFACTORED: Use the apiClient to fetch from the central server ---
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
            // --- REFACTORED: Use the apiClient to delete from the central server ---
            const result = await apiClient.async_delete(`/events/${confirmDelete.id}`);
            if (result.success) {
                fetchEvents(); // Refresh list after delete
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch(err) {
            alert(`Server Connection Error: ${err.message}`);
        }
        setConfirmDelete(null);
    };

    // Helper functions (getField, formatDate, handleAudit) remain the same
    const getField = (obj, keys, fallback = 'N/A') => {
        const key = Array.isArray(keys) ? keys[0] : keys;
        if (obj?.[key] != null && String(obj[key]).trim() !== '') return obj[key];
        return fallback;
    };
    
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('en-IN');
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

    if (loading) return <Box sx={{display: 'flex', justifyContent: 'center', mt: 4}}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    // The JSX for rendering the view remains unchanged
    return (
        <Box>
            <Typography variant="h4" gutterBottom>Event Dashboard (Central)</Typography>
            <Grid container spacing={3}>
                {events.map(event => (
                    <Grid item key={event.id} xs={12} sm={6} md={4}>
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid #ddd' }}>
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

                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 'auto' }}>
                                <Button component={Link} to={`/events/edit/${event.id}`} variant="outlined" size="small">Edit</Button>
                                <Button variant="outlined" size="small" onClick={() => handleAudit(event)}>Audit</Button>
                                <Button variant="outlined" size="small" color="error" onClick={() => setConfirmDelete(event)}>Delete</Button>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)}>
                <DialogTitle>Delete Event?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the event <strong>{getField(confirmDelete, 'name')}</strong>? 
                        This will also delete all associated participants, sessions, and check-in data. This action cannot be undone.
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
