import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    TablePagination, Button, IconButton, TextField, MenuItem, Snackbar, Dialog, DialogTitle,
    DialogContent, DialogActions, CircularProgress, Alert, Checkbox, Grid
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Print as PrintIcon } from '@mui/icons-material';
import RegistrationForm from './RegistrationForm';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOMServer from 'react-dom/server';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Badge rendering helper
const PrintableItem = ({ template, participant, qrToken }) => {
    if (!template?.template_data) return null;
    const { template_data } = template;
    const page = template_data.pages[0];

    const tokenReplace = (text) => text?.replaceAll('{{name}}', participant.name || '')
                                        .replaceAll('{{regno}}', participant.regno || '')
                                        .replaceAll('{{role}}', participant.role || '')
                                        .replaceAll('{{company}}', participant.company || '')
                                        .replaceAll('{{designation}}', participant.designation || '')
                                        .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN')) || '';

    return (
        <div style={{
            width: `${template_data.width_mm}mm`,
            height: `${template_data.height_mm}mm`,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: page.print_backgroundColor ? page.backgroundColor : '#FFF',
            backgroundImage: page.print_backgroundImage && page.backgroundImage ? `url(${page.backgroundImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        }}>
            <div style={{
                position: 'absolute',
                top: `${page.margin_top_mm}mm`,
                left: `${page.margin_left_mm}mm`,
                right: `${page.margin_right_mm}mm`,
                bottom: `${page.margin_bottom_mm}mm`,
            }}>
                {page.fields.map(field => (
                    <div key={field.id} style={{
                        position: 'absolute',
                        left: `${field.x_mm}mm`,
                        top: `${field.y_mm}mm`,
                        width: `${field.width_mm}mm`,
                        height: `${field.height_mm}mm`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: field.align || 'flex-start',
                        fontFamily: field.fontFamily,
                        fontSize: `${field.fontSize}pt`,
                        color: field.color,
                        fontWeight: field.bold ? 'bold' : 'normal',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        textDecoration: field.underline ? 'underline' : 'none',
                        whiteSpace: 'nowrap'
                    }}>
                        {field.type === 'qr' 
                            ? <QRCodeSVG value={qrToken || 'no-token'} size="100%" fgColor={field.color || '#000'} bgColor={field.bgColor || '#FFF'} />
                            : tokenReplace(field.placeholder)
                        }
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function AllParticipants({ user }) {
    const [participants, setParticipants] = useState([]);
    const [selected, setSelected] = useState([]);
    const [filters, setFilters] = useState({ regno: '', name: '', email: '', phone: '', role: '' });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [editingParticipant, setEditingParticipant] = useState(null);
    const [printLoading, setPrintLoading] = useState(false);
    const [eventRoles, setEventRoles] = useState([]);

    const showSnackbar = (msg, severity = 'success') => setSnackbar({ open: true, message: msg, severity });

    const fetchParticipants = useCallback(async () => {
        if (!user?.assignedEventId) return;
        setLoading(true);
        try {
            const eventId = Number(user.assignedEventId);  // convert to number
            if (isNaN(eventId)) throw new Error('Invalid event ID in renderer');

            const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
            const payload = { eventId, filters: cleanFilters };  // ensure structure matches main.js
            console.log('Fetching participants with payload:', payload);

            const result = await window.electronAPI.getParticipants(payload);

            if (result.success) {
                setParticipants(result.participants || []);
            } else {
                showSnackbar(result.message || 'Failed to fetch participants', 'error');
            }

        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, user]);

    const fetchRoles = useCallback(async () => {
        if (!user?.assignedEventId) return;
        try {
            const result = await window.electronAPI.getEventRoles(Number(user.assignedEventId));
            if (result.success) setEventRoles(result.roles.filter(r => r.enabled));
            else console.error('Failed to fetch roles', result);
        } catch (err) {
            console.error(err);
        }
    }, [user]);

    useEffect(() => { fetchParticipants(); fetchRoles(); }, [fetchParticipants, fetchRoles]);

    const handleFilterChange = e => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
    const handleSearch = e => { e.preventDefault(); setPage(0); fetchParticipants(); };

    const handleDelete = async () => {
        if (!confirmDeleteId) return;
        try {
            const res = await window.electronAPI.deleteParticipant(confirmDeleteId);
            if (res.success) {
                showSnackbar('Deleted participant successfully');
                fetchParticipants();
            } else showSnackbar(res.message || 'Delete failed', 'error');
        } catch (err) {
            showSnackbar(err.message, 'error');
        } finally { setConfirmDeleteId(null); }
    };

    const handleUpdateSubmit = (updatedParticipant) => {
        showSnackbar(`Updated ${updatedParticipant.name}`);
        setEditingParticipant(null);
        fetchParticipants();
    };

    const handleSelectAll = e => {
        if (e.target.checked) setSelected(participants.map(p => p.id));
        else setSelected([]);
    };
    const handleSelect = id => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const handlePrint = async ids => {
        if (!ids.length) return showSnackbar('No participants selected', 'warning');
        setPrintLoading(true);
        showSnackbar('Generating PDF...', 'info');

        try {
            const mockTemplate = {
                template_data: {
                    width_mm: 85, height_mm: 55,
                    pages: [{
                        backgroundColor: '#fff', print_backgroundColor: true,
                        margin_top_mm: 5, margin_left_mm: 5, margin_right_mm: 5, margin_bottom_mm: 5,
                        fields: [
                            { id: 1, type: 'text', placeholder: '{{name}}', x_mm: 5, y_mm: 5, width_mm: 75, height_mm: 10, fontSize: 14, bold: true, align: 'center' },
                            { id: 2, type: 'text', placeholder: '{{role}}', x_mm: 5, y_mm: 15, width_mm: 75, height_mm: 8, fontSize: 10, align: 'center' },
                            { id: 3, type: 'text', placeholder: '{{company}}', x_mm: 5, y_mm: 23, width_mm: 75, height_mm: 8, fontSize: 10, align: 'center' },
                            { id: 4, type: 'qr', placeholder: '{{regno}}', x_mm: 27.5, y_mm: 32, width_mm: 20, height_mm: 20 }
                        ]
                    }]
                }
            };

            const pdf = new jsPDF({
                orientation: mockTemplate.template_data.width_mm > mockTemplate.template_data.height_mm ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [mockTemplate.template_data.width_mm, mockTemplate.template_data.height_mm]
            });

            const printContainer = document.createElement('div');
            document.body.appendChild(printContainer);
            printContainer.style.position = 'fixed';
            printContainer.style.opacity = '0';
            printContainer.style.zIndex = '-1';

            for (let i = 0; i < ids.length; i++) {
                const participant = participants.find(p => p.id === ids[i]);
                if (!participant) continue;
                if (i > 0) pdf.addPage([mockTemplate.template_data.width_mm, mockTemplate.template_data.height_mm]);
                const qrToken = participant.regno; // Replace with real QR token if needed
                printContainer.innerHTML = ReactDOMServer.renderToString(<PrintableItem template={mockTemplate} participant={participant} qrToken={qrToken} />);
                const canvas = await html2canvas(printContainer.firstChild, { scale: 4, useCORS: true, backgroundColor: null });
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, mockTemplate.template_data.width_mm, mockTemplate.template_data.height_mm);
            }

            document.body.removeChild(printContainer);
            const blob = pdf.output('blob');
            window.open(URL.createObjectURL(blob), '_blank');
        } catch (err) {
            showSnackbar(err.message || 'PDF generation failed', 'error');
        } finally {
            setPrintLoading(false);
        }
    };

    const paginatedRows = participants.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    if (editingParticipant) return (
        <Box sx={{ p: 3 }}>
            <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setEditingParticipant(null)}>← Back</Button>
            <RegistrationForm mode="edit" initialData={editingParticipant} onSubmit={handleUpdateSubmit} onCancel={() => setEditingParticipant(null)} user={user} />
        </Box>
    );

    return (
        <Box sx={{ maxWidth: 1400, m: 'auto', mt: 3 }}>
            <Typography variant="h4" gutterBottom>All Participants</Typography>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                <form onSubmit={handleSearch}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={2}><TextField label="Reg No" name="regno" value={filters.regno} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                        <Grid item xs={12} sm={3}><TextField label="Name" name="name" value={filters.name} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                        <Grid item xs={12} sm={3}><TextField label="Email" name="email" value={filters.email} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                        <Grid item xs={12} sm={2}>
                            <TextField select label="Role" name="role" value={filters.role} onChange={handleFilterChange} size="small" fullWidth>
                                <MenuItem value=""><em>All Roles</em></MenuItem>
                                {eventRoles.map(r => <MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={2}>
                            <Button type="submit" variant="contained" fullWidth disabled={loading}>Search</Button>
                        </Grid>
                    </Grid>
                </form>
            </Paper>

            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ ml: 1, color: 'text.secondary' }}>{selected.length} selected</Typography>
                <Button variant="contained" startIcon={printLoading ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
                    onClick={() => handlePrint(selected)} disabled={!selected.length || printLoading}>
                    {printLoading ? 'Generating...' : 'Bulk Print Badges'}
                </Button>
            </Paper>

            <Paper>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox indeterminate={selected.length > 0 && selected.length < participants.length}
                                        checked={participants.length > 0 && selected.length === participants.length}
                                        onChange={handleSelectAll} />
                                </TableCell>
                                <TableCell>Reg No</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Phone</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? <TableRow><TableCell colSpan={7} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow> :
                                paginatedRows.length === 0 ? <TableRow><TableCell colSpan={7} align="center"><Typography sx={{ my: 4 }}>No participants found.</Typography></TableCell></TableRow> :
                                    paginatedRows.map(p => {
                                        const isSelected = selected.includes(p.id);
                                        return (
                                            <TableRow key={p.id} hover selected={isSelected}>
                                                <TableCell padding="checkbox"><Checkbox checked={isSelected} onChange={() => handleSelect(p.id)} /></TableCell>
                                                <TableCell>{p.regno}</TableCell>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell>{p.role}</TableCell>
                                                <TableCell>{p.email}</TableCell>
                                                <TableCell>{p.phone}</TableCell>
                                                <TableCell align="center">
                                                    <IconButton size="small" color="secondary" onClick={() => setEditingParticipant(p)} title="Update"><EditIcon /></IconButton>
                                                    <IconButton size="small" color="error" onClick={() => setConfirmDeleteId(p.id)} title="Delete"><DeleteIcon /></IconButton>
                                                    <IconButton size="small" color="primary" onClick={() => handlePrint([p.id])} title="Print Badge" disabled={printLoading}><PrintIcon /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination component="div" count={participants.length} page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
            </Paper>

            <Dialog open={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)}>
                <DialogTitle>Delete Participant?</DialogTitle>
                <DialogContent><Typography>Are you sure you want to delete this participant?</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>
        </Box>
    );
}
