import React, { useState } from 'react';
import { Box, Typography, Paper, TextField, Button, CircularProgress, Alert, Grid } from '@mui/material';
import { apiClient } from '../apiClient'; // Use the central server client
import { useNavigate } from 'react-router-dom';

export default function AddEvent() {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        organiser_name: '',
        organiser_email: '',
        organiser_phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (!formData.start_date || !formData.end_date) {
                setError('Please select both start and end dates.');
                setLoading(false);
                return;
            }

            // This correctly talks to the central server
            const result = await apiClient.async_post('/events', formData);
            if (result.success) {
                navigate('/events');
            } else {
                setError(result.message || 'Failed to create event.');
            }
        } catch (err) {
            setError('Server error.');
        } finally {
            setLoading(false);
        }
    };

    // The JSX for the form remains unchanged
    return (
        <Box>
            <Typography variant="h4" gutterBottom>Add New Event</Typography>
                <Box sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex' }}></Box>
                <Paper sx={{ p: 3, width:'100%' }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <form onSubmit={handleSubmit}>
                    <TextField name="name" label="Name" value={formData.name} onChange={handleChange} fullWidth required sx={{ mb: 2 }} />
                    <TextField name="description" label="Description" value={formData.description} onChange={handleChange} multiline rows={6} fullWidth sx={{ mb: 2 }} />
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} sm={6} width={500}>
                            <TextField name="start_date" label="From" type="date" value={formData.start_date} onChange={handleChange} fullWidth required InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={6} width={500}>
                            <TextField name="end_date" label="To" type="date" value={formData.end_date} onChange={handleChange} fullWidth required InputLabelProps={{ shrink: true }} />
                        </Grid>
                    </Grid>
                    <TextField name="organiser_name" label="Organiser Name" value={formData.organiser_name} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
                    <TextField name="organiser_phone" label="Organiser Mobile No" value={formData.organiser_phone} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
                    <TextField name="organiser_email" label="Organiser Email" type="email" value={formData.organiser_email} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
                    
                    <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                        {loading ? <CircularProgress size={24} /> : 'Create Event'}
                    </Button>
                </form>
            </Paper>
        </Box>
    );
}
