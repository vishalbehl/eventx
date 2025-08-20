import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Tabs, Tab, TextField, Button, Typography, MenuItem,
  Alert, Paper, CircularProgress, DialogActions
} from '@mui/material';
import * as XLSX from 'xlsx';

// TabPanel helper
function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ p: 3 }}>{children}</Box> : null;
}

const paidOptions = ['Paid', 'Unpaid'];
const countries = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'China', 'Other'
];

export default function RegistrationForm({ mode = 'create', initialData = {}, onSubmit, onCancel, user }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [formData, setFormData] = useState({
    role: '', name: '', designation: '', phone: '', email: '',
    company: '', paidStatus: '', country: '', regno: ''
  });
  const [roles, setRoles] = useState([]);
  const [regNoPreview, setRegNoPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch roles dynamically from Postgres via Electron
  useEffect(() => {
    async function fetchRoles() {
      if (!user?.assignedEventId) return setRoles([]);
      try {
        const result = await window.electronAPI.getEventRoles(user.assignedEventId);
        if (result.success && Array.isArray(result.roles)) {
          setRoles(result.roles.filter(r => r.enabled));
        } else {
          setRoles([]);
        }
      } catch (err) {
        console.error('Failed to fetch roles:', err);
        setRoles([]);
      }
    }
    fetchRoles();
  }, [user]);

  // Load initial data for edit mode
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setFormData({
        role: initialData.role,
        name: initialData.name,
        designation: initialData.designation,
        phone: initialData.phone,
        email: initialData.email,
        company: initialData.company,
        paidStatus: initialData.paid_status,
        country: initialData.country,
        regno: initialData.regno
      });
    }
  }, [mode, initialData]);

  // Fetch Registration Number preview for new participants
  useEffect(() => {
    if (mode === 'edit' || !formData.role || !user?.assignedEventId) {
      setRegNoPreview('');
      return;
    }
    let isMounted = true;
    async function fetchRegNoPreview() {
      try {
        setRegNoPreview('Loading...');
        const roleObj = roles.find(r => r.code === formData.role);
        if (!roleObj) {
          if (isMounted) setRegNoPreview('');
          return;
        }
        const result = await window.electronAPI.getNextRegNo(user.assignedEventId, roleObj.code);
        if (isMounted) setRegNoPreview(result.success ? result.regno : 'Error');
      } catch {
        if (isMounted) setRegNoPreview('Error');
      }
    }
    fetchRegNoPreview();
    return () => { isMounted = false; }
  }, [formData.role, mode, user, roles]);

  // Handle form input changes
  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Submit single registration
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const isEdit = mode === 'edit';
      const payload = { ...formData, event_id: user.assignedEventId, source: 'offline' };
      if (!isEdit) payload.regno = regNoPreview;

      const result = isEdit
        ? await window.electronAPI.updateLocalParticipant(initialData.id, payload)
        : await window.electronAPI.addLocalParticipant(payload);

      if (!result.success) throw new Error(result.message || 'Error');

      setSuccessMsg(isEdit ? 'Participant updated successfully!' : `Registered! Reg No: ${result.participant.regno}`);
      if (!isEdit) setFormData({ role: '', name: '', designation: '', phone: '', email: '', company: '', paidStatus: '', country: '', regno: '' });
      if (onSubmit) onSubmit(result.participant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection for bulk upload
  const handleBulkFileChange = (e) => {
    if (e.target.files.length > 0) setBulkFile(e.target.files[0]);
  };

  // Process bulk upload
  const handleBulkUpload = async () => {
    if (!bulkFile) return setError('Please select a file');
    setBulkLoading(true);
    setError('');
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        const result = await window.electronAPI.addBulkLocalParticipants(user.assignedEventId, jsonData);
        if (result.success) {
          setBulkResult(result.result);
        } else {
          throw new Error(result.message || 'Bulk upload failed.');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setBulkLoading(false);
        setBulkFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(bulkFile);
  };

  // Render single registration form
  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      <TextField
        select
        name="role"
        label="Role"
        value={formData.role || ''}
        onChange={handleChange}
        fullWidth
        sx={{ mb: 2 }}
        required
      >
        <MenuItem value=""><em>Select a Role...</em></MenuItem>
        {roles.map(r => (
          <MenuItem key={r.code} value={r.code}>{r.name || r.label}</MenuItem>
        ))}
      </TextField>

      {mode === 'create' && regNoPreview && (
        <TextField
          label="Registration Number (Preview)"
          value={regNoPreview}
          InputProps={{ readOnly: true }}
          error={regNoPreview === 'Error'}
          helperText={regNoPreview === 'Error' ? 'Could not fetch preview' : ''}
          fullWidth
          sx={{ mb: 2 }}
        />
      )}

      {mode === 'edit' && (
        <TextField
          label="Registration Number"
          value={formData.regno || ''}
          InputProps={{ readOnly: true }}
          fullWidth
          sx={{ mb: 2 }}
        />
      )}

      <TextField label="Name" name="name" value={formData.name || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }} required />
      <TextField label="Phone" name="phone" value={formData.phone || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
      <TextField label="Email" name="email" value={formData.email || ''} onChange={handleChange} type="email" fullWidth sx={{ mb: 2 }} />
      <TextField label="Company" name="company" value={formData.company || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
      <TextField label="Designation" name="designation" value={formData.designation || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }} />
      <TextField select name="country" label="Country" value={formData.country || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }}>
        <MenuItem value=""><em>None</em></MenuItem>
        {countries.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
      </TextField>
      <TextField select name="paidStatus" label="Paid / Unpaid" value={formData.paidStatus || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }}>
        <MenuItem value=""><em>None</em></MenuItem>
        {paidOptions.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
      </TextField>

      <DialogActions sx={{ mt: 2, px: 0 }}>
        <Button
          type="submit"
          variant="contained"
          disabled={loading || (mode === 'create' && (regNoPreview === 'Loading...' || regNoPreview === 'Error'))}
        >
          {loading ? <CircularProgress size={24} /> : (mode === 'edit' ? 'Update' : 'Register')}
        </Button>
        {onCancel && <Button variant="text" onClick={onCancel}>Cancel</Button>}
      </DialogActions>
    </form>
  );

  // Main return
  return (
    <Box sx={{ maxWidth: mode === 'edit' ? 600 : 900, m: 'auto', mt: 4 }}>
      <Paper sx={{ p: mode === 'edit' ? 3 : 0 }}>
        {mode === 'edit' && <Typography variant="h6" gutterBottom>Edit Participant</Typography>}

        {!mode === 'edit' && (
          <Tabs value={tabIndex} onChange={(e, val) => setTabIndex(val)} centered>
            <Tab label="Single Registration" />
            <Tab label="Bulk Upload" />
          </Tabs>
        )}

        <TabPanel value={tabIndex} index={0}>
          <Box sx={{ p: 3 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
            {renderForm()}
          </Box>
        </TabPanel>

        <TabPanel value={tabIndex} index={1}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Bulk Upload Participants</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {bulkResult && (
              <Alert severity={bulkResult.errors.length > 0 ? "warning" : "success"} sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                <Typography variant="body1">
                  {`Inserted: ${bulkResult.inserted.length}, Skipped: ${bulkResult.skipped.length}, Failed: ${bulkResult.errors.length}`}
                </Typography>
                {bulkResult.errors.length > 0 && (
                  <Box mt={1} sx={{ maxHeight: 150, overflowY: 'auto' }}>
                    {bulkResult.errors.map((e, i) => (
                      <Typography key={i} variant="caption" display="block">
                        - Row '{e.participant.name || e.participant.email}': {e.error}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Alert>
            )}
            <input ref={fileInputRef} type="file" onChange={handleBulkFileChange} accept=".xlsx,.xls,.csv" style={{ display: 'block', marginBottom: 16 }} />
            <Button variant="contained" onClick={handleBulkUpload} disabled={bulkLoading || !bulkFile}>
              {bulkLoading ? <CircularProgress size={24} /> : 'Upload and Process File'}
            </Button>
            <Box sx={{ mt: 3, p: 2, border: '1px dashed grey', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Excel file must have exact columns (case-sensitive):<br/>
                <code>name, role, email, phone, company, designation, country, paidStatus</code>
              </Typography>
            </Box>
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
}
