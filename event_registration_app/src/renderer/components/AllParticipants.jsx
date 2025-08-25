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

const generateVCardString = (data) => (
  `BEGIN:VCARD
VERSION:3.0
FN:${data.name || ''}
ORG:${data.company || ''}
TITLE:${data.designation || ''}
TEL;TYPE=WORK,VOICE:${data.phone || ''}
EMAIL:${data.email || ''}
END:VCARD`
);


// Badge rendering helper
const PrintableItem = ({ template, participant, qrToken, pageIndex = 0 }) => {
    if (!template?.template_data) return null;
    const { template_data } = template;
    const page = template_data.pages[pageIndex];
    if (!page) return null;

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
                        {/* ***** FIX: Added specific logic for 'contact_qr' and other types ***** */}
                        {(() => {
                            switch (field.type) {
                                case 'qr':
                                    return <QRCodeSVG value={qrToken || 'no-token'} size="100%" fgColor={field.color || '#000'} bgColor={field.bgColor || '#FFF'} />;
                                case 'contact_qr':
                                    return <QRCodeSVG value={generateVCardString(participant)} size="100%" fgColor="#000" bgColor="#FFF" />;
                                default:
                                    return tokenReplace(field.placeholder);
                            }
                        })()}
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
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [editingParticipant, setEditingParticipant] = useState(null);
    const [printLoading, setPrintLoading] = useState(false);
    const [eventRoles, setEventRoles] = useState([]);

    const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });

    const fetchParticipants = useCallback(async () => {
        if (!user?.assignedEventId) return;
        setLoading(true);
        try {
            // Make sure assignedEventId is a number
            const eventId = Number(user.assignedEventId);
            if (isNaN(eventId)) throw new Error('Invalid event ID in renderer');

            // Only include filters that have a value
            const cleanFilters = Object.fromEntries(
                Object.entries(filters || {}).filter(([_, v]) => v)
            );

            // Flatten payload correctly
            const payload = { eventId, filters: cleanFilters };
            console.log('Sending payload to backend:', payload);

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

    const handlePrint = async (ids) => {
        if (!ids || ids.length === 0) return showSnackbar('No participants selected.', 'warning');
        setPrintLoading(true);
        showSnackbar('Preparing to print...', 'info');

        try {
            const eventRes = await window.electronAPI.getEventById(user.assignedEventId);
            if (!eventRes.success || !eventRes.event) {
                throw new Error('Could not find event details. Printing is not configured.');
            }
            
            let printSettings = eventRes.event.print_settings || {};
            if (typeof printSettings === 'string') {
                printSettings = JSON.parse(printSettings || '{}');
            }

            const participantsToPrint = participants.filter(p => ids.includes(p.id));
            if (participantsToPrint.length === 0) throw new Error("Selected participants not found.");

            const templateCache = {}; // Cache to avoid re-fetching the same template
            let pdf = null; // Initialize PDF variable

            // Loop through each selected participant
            for (let i = 0; i < participantsToPrint.length; i++) {
                const participant = participantsToPrint[i];
                
                // Determine the correct template ID for THIS participant's role
                const templateId = printSettings.useSingleBadgeTemplate
                    ? printSettings.singleBadgeTemplateId
                    : (printSettings.badgeAssignments || {})[participant.role];

                if (!templateId) {
                    console.warn(`Skipping print for ${participant.name}: No template assigned for role "${participant.role}".`);
                    continue;
                }
                
                // Fetch the template from cache or from the backend
                let template = templateCache[templateId];
                if (!template) {
                    const templateRes = await window.electronAPI.getTemplateById(templateId);
                    if (templateRes.success && templateRes.template) {
                        template = templateRes.template;
                        templateCache[templateId] = template;
                    } else {
                        console.warn(`Could not load template with ID ${templateId}. Skipping participant ${participant.name}.`);
                        continue;
                    }
                }
                
                // Initialize the PDF on the first valid participant
                if (!pdf) {
                    const { width_mm, height_mm } = template.template_data;
                    pdf = new jsPDF({
                        orientation: width_mm > height_mm ? 'landscape' : 'portrait',
                        unit: 'mm',
                        format: [width_mm, height_mm]
                    });
                }
                
                const qrToken = participant.regno;

                // Loop through EACH PAGE of the template (for front/back printing)
                for (let pageIndex = 0; pageIndex < template.template_data.pages.length; pageIndex++) {
                    const { width_mm, height_mm } = template.template_data;
                    
                    if (i > 0 || pageIndex > 0) {
                        pdf.addPage([width_mm, height_mm], pdf.getFont().orientation);
                    }
                    
                    const badgeHtml = ReactDOMServer.renderToString(
                        <PrintableItem template={template} participant={participant} qrToken={qrToken} pageIndex={pageIndex} />
                    );
                    
                    const printContainer = document.getElementById('print-container-temp') || document.createElement('div');
                    printContainer.id = 'print-container-temp';
                    document.body.appendChild(printContainer);
                    Object.assign(printContainer.style, { position: 'fixed', opacity: '0', zIndex: '-1', width: `${width_mm}mm`, height: `${height_mm}mm` });

                    printContainer.innerHTML = badgeHtml;
                    const canvas = await html2canvas(printContainer.children[0], { scale: 2, useCORS: true, backgroundColor: null });
                    const imgData = canvas.toDataURL('image/jpeg', 0.9);
                    pdf.addImage(imgData, 'JPEG', 0, 0, width_mm, height_mm);

                    document.body.removeChild(printContainer);
                }
            }

            if (pdf) {
                const blob = pdf.output('blob');
                window.open(URL.createObjectURL(blob), '_blank');
                showSnackbar('PDF generated successfully!', 'success');
            } else {
                throw new Error("No valid templates found for the selected participants.");
            }

        } catch (err) {
            showSnackbar(err.message || 'PDF generation failed.', 'error');
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
                            <TextField select label="Role" name="role" value={filters.role} onChange={handleFilterChange} size="small" fullWidth sx={{ minWidth: 200 }}>
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
