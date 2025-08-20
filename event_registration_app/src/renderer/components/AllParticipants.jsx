import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    TablePagination, Button, IconButton, TextField, MenuItem, Snackbar, Dialog, DialogTitle,
    DialogContent, DialogActions, CircularProgress, Alert, Checkbox,Grid
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PrintIcon from '@mui/icons-material/Print';
import RegistrationForm from './RegistrationForm';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOMServer from 'react-dom/server';
import { localApiClient } from '../localApiClient'; // For client kiosks

const PrintableItem = ({ template, participant }) => {
  // This component does not need changes as it receives data via props.
  const { template_data } = template;
  if (!template_data) return null;

  const tokenReplace = (text) => {
    if (!text) return '';
    return text
      .replaceAll('{{name}}', participant.name || '')
      .replaceAll('{{regno}}', participant.regno || '')
      .replaceAll('{{role}}', participant.role || '')
      .replaceAll('{{company}}', participant.company || '')
      .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN'));
  };

  const pageLayout = template_data.pages[0];

  return (
    <div style={{
      width: `${template_data.width_mm}mm`,
      height: `${template_data.height_mm}mm`,
      position: 'relative',
      overflow: 'hidden',
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
            {field.type === 'qr' ? (
              <QRCodeSVG
                value={participant?.jwtToken || tokenReplace(field.placeholder)}
                size="100%"
                fgColor={field.color}
                bgColor={field.bgColor}
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

export default function AllParticipants({ user, isHub = false }) {
    const [participants, setParticipants] = useState([]);
    const [selected, setSelected] = useState([]);
    const [filters, setFilters] = useState({ regno: '', name: '', email: '', phone: '', role: '' });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [totalCount, setTotalCount] = useState(0);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [editingParticipant, setEditingParticipant] = useState(null);
    const [printLoading, setPrintLoading] = useState(false);
    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const eventId = user.assignedEventId;
            const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v));
            
            const result = isHub
                ? await window.electronAPI.getLocalParticipants(eventId, cleanFilters)
                : await localApiClient.get(`/participants?eventId=${eventId}&${new URLSearchParams(cleanFilters)}`);

            if (result.success) {
                setParticipants(result.participants || []);
                setTotalCount(result.participants.length);
            } else {
                showSnackbar(result.message || 'Failed to fetch data', 'error');
            }
        } catch (err) {
            showSnackbar(`Error: ${err.message}`, 'error');
        }
        setLoading(false);
    }, [filters, user, isHub]);

    useEffect(() => {
        fetchData();
        // If running as a client kiosk, poll for real-time updates
        if (!isHub) {
            const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
            return () => clearInterval(interval);
        }
    }, [fetchData, isHub]);

    const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });
    const handleFilterChange = (e) => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
    const handleSearch = (e) => { e.preventDefault(); fetchData(); };

    const handleDelete = async () => {
        if (!confirmDeleteId) return;
        try {
        // Use the local Electron API
        const res = await window.electronAPI.deleteLocalParticipant(confirmDeleteId);
        if (res.success) {
            showSnackbar('Deleted participant successfully');
            fetchData();
        } else {
            showSnackbar(res.message || 'Delete failed', 'error');
        }
        } catch (err) {
        showSnackbar('Local DB error: ' + err.message, 'error');
        }
        setConfirmDeleteId(null);
    };

    const handleUpdateSubmit = (updatedParticipant) => {
        showSnackbar(`Participant ${updatedParticipant.name} updated successfully!`);
        setEditingParticipant(null);
        fetchData();
    };

    const handleSelectAllClick = (event) => {
      if (event.target.checked) {
        const newSelected = participants.map((p) => p.id); // select all participant IDs
        setSelected(newSelected);
        return;
      }
      setSelected([]);
    };

    const handlePrint = async (ids, type = 'badge') => {
        if (!ids || ids.length === 0) return showSnackbar('No participants selected.', 'warning');
        setPrintLoading(true);
        showSnackbar('Generating PDF...', 'info');
        try {
            const eventId = user.assignedEventId;
            const eventRes = await window.electronAPI.getLocalEventById(eventId);
            if (!eventRes.success || !eventRes.event) throw new Error('Could not find event details.');
            
            const printSettings = JSON.parse(eventRes.event.print_settings || '{}');
            const templateId = printSettings.useSingleBadgeTemplate
                ? printSettings.singleBadgeTemplateId
                : (printSettings.badgeAssignments || {})[type];

            if (!templateId) throw new Error(`No default "${type}" template has been set for this event.`);

            const templateRes = await window.electronAPI.getLocalTemplateById(templateId);
            if (!templateRes.success) throw new Error('Could not load the print template.');
            
            const template = templateRes.template;
            const { width_mm, height_mm } = template.template_data;

            const pdf = new jsPDF({
                orientation: width_mm > height_mm ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [width_mm, height_mm]
            });

            const printContainer = document.createElement('div');
            document.body.appendChild(printContainer);
            Object.assign(printContainer.style, { position: 'fixed', opacity: '0', zIndex: '-1' });

            for (let i = 0; i < participantsToPrint.length; i++) {
                const participant = participantsToPrint[i];
                if (i > 0) pdf.addPage([width_mm, height_mm], template.template_data.orientation);

                const badgeHtml = ReactDOMServer.renderToString(<PrintableItem template={template} participant={participant} />);
                printContainer.innerHTML = badgeHtml;

                const pageElement = printContainer.children[0];
                const canvas = await html2canvas(pageElement, { scale: 4, useCORS: true, backgroundColor: null });
                const imgData = canvas.toDataURL('image/png');
                pdf.addImage(imgData, 'PNG', 0, 0, width_mm, height_mm);
            }

            document.body.removeChild(printContainer);
            const blob = pdf.output('blob');
            window.open(URL.createObjectURL(blob), '_blank');

        } catch (err) {
            showSnackbar(err.message || 'PDF generation failed.', 'error');
        } finally {
            setPrintLoading(false);
        }
    };
    
  const paginatedRows = participants.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (editingParticipant) {
    return (
      <Box sx={{ width: '100%', p: 3 }}>
        <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setEditingParticipant(null)}>← Back to List</Button>
        <RegistrationForm mode="edit" initialData={editingParticipant} onSubmit={handleUpdateSubmit} onCancel={() => setEditingParticipant(null)} user={user} />
      </Box>
    );
  }  

return (
    <Box sx={{ maxWidth: 1400, margin: 'auto', mt: 3 }}>
      <Typography variant="h4" gutterBottom>All Participants</Typography>
      <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
        <form onSubmit={handleSearch}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={2}><TextField label="Reg No" name="regno" value={filters.regno} onChange={handleFilterChange} size="small" fullWidth /></Grid>
            <Grid item xs={12} sm={3}><TextField label="Name" name="name" value={filters.name} onChange={handleFilterChange} size="small" fullWidth /></Grid>
            <Grid item xs={12} sm={3}><TextField label="Email" name="email" value={filters.email} onChange={handleFilterChange} size="small" fullWidth /></Grid>
            <Grid item xs={12} sm={2}><TextField select label="Role" name="role" value={filters.role} onChange={handleFilterChange} size="small" fullWidth>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Delegate">Delegate</MenuItem>
              <MenuItem value="Faculty">Faculty</MenuItem>
              <MenuItem value="Organizer">Organizer</MenuItem>
              <MenuItem value="Crew">Crew</MenuItem>
              <MenuItem value="VIP">VIP</MenuItem>
            </TextField></Grid>
            <Grid item xs={12} sm={2}><Button type="submit" variant="contained" fullWidth disabled={loading}>Search</Button></Grid>
          </Grid>
        </form>
      </Paper>
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ ml: 1, color: 'text.secondary' }}>
          {selected.length} selected
        </Typography>
        <Button
          variant="contained"
          startIcon={printLoading ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
          onClick={() => handlePrint(selected)}
          disabled={selected.length === 0 || printLoading}
        >
          {printLoading ? 'Generating...' : 'Bulk Print Badges'}
        </Button>
      </Paper>
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < participants.length}
                    checked={participants.length > 0 && selected.length === participants.length}
                    onChange={handleSelectAllClick}
                  />
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
              {loading ? <TableRow><TableCell colSpan={7} align="center"><CircularProgress /></TableCell></TableRow>
                : paginatedRows.map((p) => {
                  const isItemSelected = selected.includes(p.id);
                  return (
                    <TableRow key={p.id} hover selected={isItemSelected}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={isItemSelected} onChange={() => handleSelect(p.id)} />
                      </TableCell>
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
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        />
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
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}