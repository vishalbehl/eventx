import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Grid, TableContainer, Table, TableHead,
    TableRow, TableCell, TableBody, CircularProgress, Alert,
    TextField, Button, MenuItem, Snackbar, IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOMServer from 'react-dom/server';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Helper component to render the certificate based on a template
const PrintableItem = ({ template, participant }) => {
    if (!template || !participant) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                <Typography>Select a participant to preview their certificate.</Typography>
            </Box>
        );
    }

    const templateData = template.template_data;
    if (!templateData) return <Alert severity="error">Template data is corrupted or missing.</Alert>;

    const tokenReplace = (text) => {
        if (!text) return '';
        return text
            .replaceAll('{{name}}', participant.name || '')
            .replaceAll('{{regno}}', participant.regno || '')
            .replaceAll('{{role}}', participant.role || '')
            .replaceAll('{{company}}', participant.company || '')
            .replaceAll('{{designation}}', participant.designation || '')
            .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN'));
    };

    const pageLayout = templateData.pages[0];

    return (
        <div style={{
            width: `${templateData.width_mm}mm`,
            height: `${templateData.height_mm}mm`,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: pageLayout.print_backgroundColor ? pageLayout.backgroundColor : '#FFFFFF',
            backgroundImage: pageLayout.print_backgroundImage && pageLayout.backgroundImage ? `url(${pageLayout.backgroundImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid #ccc',
            margin: 'auto'
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
                        {field.type === 'qr' ? (
                            <QRCodeSVG
                                value={participant.regno || 'N/A'}
                                size="100%"
                                fgColor={field.color || '#000000'}
                                bgColor={field.bgColor || '#FFFFFF'}
                            />
                        ) : (
                            tokenReplace(field.placeholder)
                        )}
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
    const [snackbar, setSnackbar] = useState({ open: false, message: '' });
    
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [certificateTemplate, setCertificateTemplate] = useState(null);
    const [printLoading, setPrintLoading] = useState(false);

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
    
    // Fetch the certificate template for the event
    useEffect(() => {
        async function fetchTemplate() {
            try {
                if (!user?.assignedEventId) return;

                // 1. Get the event details
                const eventRes = await window.electronAPI.getEventById(user.assignedEventId);
                if (!eventRes.success || !eventRes.event) {
                    throw new Error("Could not load the current event's details.");
                }

                // 2. Parse the print_settings (it might be a string)
                let printSettings = eventRes.event.print_settings;
                if (typeof printSettings === 'string') {
                    printSettings = JSON.parse(printSettings || '{}');
                }

                // 3. Determine the correct template ID from the settings
                const templateId = printSettings.useSingleCertTemplate
                    ? printSettings.singleCertTemplateId
                    : null; // Role-based certs not implemented in this example

                if (!templateId) {
                    setError('No single certificate template has been assigned to this event. Please check the event settings in the Admin App.');
                    return;
                }

                // 4. Fetch the template using the correct ID
                const templateRes = await window.electronAPI.getTemplateById(templateId);
                if (templateRes.success && templateRes.template) {
                    setCertificateTemplate(templateRes.template);
                } else {
                    setError(`The assigned certificate template (ID: ${templateId}) could not be found in the local database.`);
                }
            } catch (err) {
                setError(`Error fetching certificate template: ${err.message}`);
                console.error(err);
            }
        }
        fetchTemplate();
    }, [user]);

    const handleFilterChange = (e) => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
    const handleSearch = (e) => { e.preventDefault(); fetchData(); };
    
    const handleSelectParticipant = (participant) => {
        setSelectedParticipant(participant);
    };


    const handlePrint = async (idsToPrint) => {
        // ******** THIS IS THE FIX ********
        // Ensure idsToPrint is always an array.
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
            document.body.appendChild(printContainer);
            Object.assign(printContainer.style, { position: 'fixed', opacity: '0', zIndex: '-1', width: `${width_mm}mm`, height: `${height_mm}mm` });

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
            const fileName = ids.length > 1 ? 'Certificates_Bulk.pdf' : `${participantsToPrint[0].name}_Certificate.pdf`;
            pdf.save(fileName);
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
            <Grid container spacing={3}>
                {/* Left Column: Search and Table */}
                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 2, mb: 2 }}>
                        <form onSubmit={handleSearch}>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12}><TextField label="Search by Name" name="name" value={filters.name} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                                <Grid item xs={12} sm={6}><TextField label="Search by Reg. No." name="regno" value={filters.regno} onChange={handleFilterChange} size="small" fullWidth /></Grid>
                                <Grid item xs={12} sm={6}><Button type="submit" variant="contained" fullWidth startIcon={<SearchIcon />}>Search</Button></Grid>
                            </Grid>
                        </form>
                    </Paper>
                    <TableContainer component={Paper}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Reg. No.</TableCell>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Role</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={3} align="center"><CircularProgress sx={{ my: 4 }} /></TableCell></TableRow>
                                ) : participants.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} align="center"><Typography sx={{ my: 4 }}>No participants found.</Typography></TableCell></TableRow>
                                ) : (
                                    participants.map((p) => (
                                        <TableRow
                                            key={p.id}
                                            hover
                                            onClick={() => handleSelectParticipant(p)}
                                            selected={selectedParticipant?.id === p.id}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell>{p.regno}</TableCell>
                                            <TableCell>{p.name}</TableCell>
                                            <TableCell>{p.role}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                {/* Right Column: Preview */}
                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 2, position: 'sticky', top: '20px' }}>
                        <Typography variant="h6" gutterBottom>Certificate Preview</Typography>
                        <Box sx={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 1, p: 2 }}>
                           <PrintableItem template={certificateTemplate} participant={selectedParticipant} />
                        </Box>
                        <Button
                            variant="contained"
                            color="success"
                            fullWidth
                            sx={{ mt: 2 }}
                            onClick={handlePrint}
                            disabled={!selectedParticipant || !certificateTemplate || printLoading}
                            startIcon={printLoading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
                        >
                            {printLoading ? 'Generating...' : 'Download Certificate'}
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                message={snackbar.message}
            />
        </Box>
    );
}
