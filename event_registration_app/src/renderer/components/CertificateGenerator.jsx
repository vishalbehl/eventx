import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Grid, TableContainer, Table, TableHead,
    TableRow, TableCell, TableBody, CircularProgress, Alert,
    TextField, Button, MenuItem, Checkbox
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOMServer from 'react-dom/server';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Helper component to render the certificate HTML for PDF generation.
// It is not displayed directly in the UI.
const PrintableItem = ({ template, participant }) => {
    const templateData = template.template_data;
    if (!templateData) return null;

    const tokenReplace = (text) => (text || '')
        .replaceAll('{{name}}', participant.name || '')
        .replaceAll('{{regno}}', participant.regno || '')
        .replaceAll('{{role}}', participant.role || '')
        .replaceAll('{{company}}', participant.company || '')
        .replaceAll('{{designation}}', participant.designation || '')
        .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN'));

    const pageLayout = templateData.pages[0];

    return (
        <div style={{
            width: `${templateData.width_mm}mm`,
            height: `${templateData.height_mm}mm`,
            position: 'relative',
            backgroundColor: pageLayout.print_backgroundColor ? pageLayout.backgroundColor : '#FFFFFF',
            backgroundImage: pageLayout.print_backgroundImage && pageLayout.backgroundImage ? `url(${pageLayout.backgroundImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        }}>
            <div style={{
                position: 'absolute',
                top: `${pageLayout.margin_top_mm}mm`,
                left: `${pageLayout.margin_left_mm}mm`,
                right: `${pageLayout.margin_right_mm}mm`,
                bottom: `${pageLayout.margin_bottom_mm}mm`,
            }}>
                {pageLayout.fields.map((field) => (
                    <div key={field.id} style={{
                        position: 'absolute',
                        left: `${field.x_mm}mm`,
                        top: `${field.y_mm}mm`,
                        width: `${field.width_mm}mm`,
                        height: `${field.height_mm}mm`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: field.align || 'left',
                        fontFamily: field.fontFamily,
                        fontSize: `${field.fontSize}pt`,
                        color: field.color,
                        fontWeight: field.bold ? 'bold' : 'normal',
                        fontStyle: field.italic ? 'italic' : 'normal',
                        textDecoration: field.underline ? 'underline' : 'none',
                        whiteSpace: 'nowrap',
                    }}>
                        {field.type === 'qr' ? <QRCodeSVG value={participant.regno || 'N/A'} size="100%" fgColor={field.color || '#000000'} bgColor={field.bgColor || '#FFFFFF'} /> : tokenReplace(field.placeholder)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function CertificateGenerator({ user }) {
    const [participants, setParticipants] = useState([]);
    const [filters, setFilters] = useState({ regno: '', name: '', role: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState([]);
    const [certificateTemplate, setCertificateTemplate] = useState(null);
    const [printLoading, setPrintLoading] = useState(false);
    const [eventRoles, setEventRoles] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const eventId = user.assignedEventId;
            if (!eventId) throw new Error("No event assigned.");
            const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
            const result = await window.electronAPI.getParticipants({ eventId, filters: cleanFilters });
            if (result.success) {
                setParticipants(result.participants || []);
            } else {
                throw new Error(result.message || 'Failed to fetch participants');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters, user]);

    useEffect(() => {
        fetchData(); // Initial data fetch
        async function fetchInitialData() {
            if (!user?.assignedEventId) return;
            try {
                const rolesRes = await window.electronAPI.getEventRoles(user.assignedEventId);
                if (rolesRes.success) setEventRoles(rolesRes.roles.filter(r => r.enabled));
                const eventRes = await window.electronAPI.getEventById(user.assignedEventId);
                if (eventRes.success && eventRes.event) {
                    let printSettings = eventRes.event.print_settings;
                    if (typeof printSettings === 'string') printSettings = JSON.parse(printSettings || '{}');
                    const templateId = printSettings.useSingleCertTemplate ? printSettings.singleCertTemplateId : null;
                    if (templateId) {
                        const templateRes = await window.electronAPI.getTemplateById(templateId);
                        if (templateRes.success && templateRes.template) {
                            setCertificateTemplate(templateRes.template);
                        } else {
                            setError('The assigned certificate template could not be found.');
                        }
                    } else {
                        setError('No single certificate template is assigned to this event.');
                    }
                } else {
                    setError('Could not load event details to find the certificate template.');
                }
            } catch (err) {
                setError(`Error fetching initial data: ${err.message}`);
            }
        }
        fetchInitialData();
    }, [user, fetchData]);

    const handleFilterChange = (e) => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
    const handleSearch = (e) => { e.preventDefault(); fetchData(); };

    const handleSelectAllClick = (event) => {
        if (event.target.checked) {
            setSelected(participants.map((p) => p.id));
            return;
        }
        setSelected([]);
    };

    const handleSelect = (id) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected = [];
        if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
        else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
        else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
        else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
        setSelected(newSelected);
    };

    const handlePrint = async (idsToPrint) => {
        const ids = Array.isArray(idsToPrint) ? idsToPrint : [idsToPrint];
        if (ids.length === 0) return setError('No participants selected for printing.');
        if (!certificateTemplate) return setError('Certificate template is not loaded.');
        
        setPrintLoading(true);
        try {
            const participantsToPrint = participants.filter(p => ids.includes(p.id));
            if (participantsToPrint.length === 0) throw new Error("Selected participants not found.");
            const { width_mm, height_mm } = certificateTemplate.template_data;
            const pdf = new jsPDF({ orientation: width_mm > height_mm ? 'landscape' : 'portrait', unit: 'mm', format: [width_mm, height_mm] });
            const printContainer = document.createElement('div');
            Object.assign(printContainer.style, { position: 'fixed', opacity: '0', zIndex: '-1', width: `${width_mm}mm`, height: `${height_mm}mm` });
            document.body.appendChild(printContainer);

            for (let i = 0; i < participantsToPrint.length; i++) {
                const participant = participantsToPrint[i];
                if (i > 0) pdf.addPage([width_mm, height_mm], pdf.getFont().orientation);
                const certHtml = ReactDOMServer.renderToString(<PrintableItem template={certificateTemplate} participant={participant} />);
                printContainer.innerHTML = certHtml;
                const canvas = await html2canvas(printContainer.children[0], { scale: 2, useCORS: true, backgroundColor: null });
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                pdf.addImage(imgData, 'JPEG', 0, 0, width_mm, height_mm);
            }
            document.body.removeChild(printContainer);
            const blob = pdf.output('blob');
            window.open(URL.createObjectURL(blob), '_blank');

        } catch (err) {
            setError(`PDF Generation Failed: ${err.message}`);
        } finally {
            setPrintLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>Certificate Generator</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            <Paper sx={{ p: 2, mb: 2 }}>
                <form onSubmit={handleSearch}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={3}><TextField label="Search by Name" name="name" value={filters.name} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                        <Grid item xs={12} sm={3}><TextField label="Search by Reg. No." name="regno" value={filters.regno} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                        <Grid item xs={12} sm={3}>
                            <TextField select label="Role" name="role" value={filters.role} onChange={handleFilterChange} size="small" fullWidth sx={{ minWidth: 180 }}>
                                <MenuItem value=""><em>All Roles</em></MenuItem>
                                {eventRoles.map(r => <MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={3}><Button type="submit" variant="contained" fullWidth startIcon={<SearchIcon />}>Search</Button></Grid>
                    </Grid>
                </form>
            </Paper>

            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ ml: 1, color: 'text.secondary' }}>{selected.length} selected</Typography>
                <Button variant="contained" color="secondary" onClick={() => handlePrint(selected)} disabled={selected.length === 0 || printLoading} startIcon={printLoading ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}>
                    Bulk Print Certificates
                </Button>
            </Paper>

            <Paper>
                <TableContainer>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox"><Checkbox indeterminate={selected.length > 0 && selected.length < participants.length} checked={participants.length > 0 && selected.length === participants.length} onChange={handleSelectAllClick} /></TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Reg. No.</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
                            ) : participants.map((p) => {
                                const isItemSelected = selected.includes(p.id);
                                return (
                                    <TableRow key={p.id} hover>
                                        <TableCell padding="checkbox"><Checkbox checked={isItemSelected} onChange={() => handleSelect(p.id)} /></TableCell>
                                        <TableCell>{p.name}</TableCell>
                                        <TableCell>{p.regno}</TableCell>
                                        <TableCell>{p.role}</TableCell>
                                        <TableCell align="center">
                                            <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={() => handlePrint([p.id])} disabled={printLoading}>
                                                Print
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
