import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Tabs, Tab, TextField, Button, Typography, MenuItem,
  Alert, Paper, CircularProgress, DialogActions, Grid
} from '@mui/material';
import * as XLSX from 'xlsx';

// The apiClient import is no longer needed.

const roles = [
  { label: 'Delegate', code: 'DEL' },
  { label: 'Faculty', code: 'FAC' },
  { label: 'Organizer', code: 'ORG' },
  { label: 'Crew', code: 'CRW' },
  { label: 'VIP', code: 'VIP' }
];
const paidOptions = ['Paid', 'Unpaid'];
const countries = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'China', 'Other'
];

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ p: 3 }}>{children}</Box> : null;
}

export default function RegistrationForm({ mode = 'create', initialData = {}, onSubmit, onCancel, user }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [formData, setFormData] = useState({
    role: '', name: '', designation: '', phone: '', email: '',
    company: '', paidStatus: '', country: '', regno: ''
  });
  const [regNoPreview, setRegNoPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Bulk upload state
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setFormData({ ...initialData, paidStatus: initialData.paid_status });
    }
  }, [mode, initialData]);
  
  // --- REFACTORED ---
  useEffect(() => {
    if (mode === 'edit' || !formData.role || !user?.assignedEventId) {
      setRegNoPreview('');
      return;
    }

    let isMounted = true;
    async function fetchRegNoPreview() {
      try {
        setRegNoPreview('Loading...');
        const roleObj = roles.find(r => r.label === formData.role);
        if (!roleObj) {
          if (isMounted) setRegNoPreview('');
          return;
        }
        
        // Use the local Electron API
        const result = await window.electronAPI.getNextRegNo(user.assignedEventId, roleObj.code);
        if(isMounted) {
            setRegNoPreview(result.success ? result.regno : 'Error');
        }
      } catch (err) {
        if(isMounted) setRegNoPreview('Error');
      }
    }
    fetchRegNoPreview();

    return () => { isMounted = false; }
  }, [formData.role, mode, user]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // --- REFACTORED ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const isEdit = mode === 'edit';
      const payload = { ...formData, event_id: user.assignedEventId, source: 'offline' };
      
      if (!isEdit) {
        payload.regno = regNoPreview;
      }

      // Use the local Electron API
      const result = isEdit 
        ? await window.electronAPI.updateLocalParticipant(initialData.id, payload) 
        : await window.electronAPI.addLocalParticipant(payload);

      if (!result.success) throw new Error(result.message || 'An error occurred');

      setSuccessMsg(isEdit ? 'Participant updated successfully!' : `Registered! Reg No: ${result.participant.regno}`);
      if (!isEdit) {
        setFormData({ role: '', name: '', designation: '', phone: '', email: '', company: '', paidStatus: '', country: '', regno: '' });
      }
      if (onSubmit) onSubmit(result.participant);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- REFACTORED ---
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
        
        // Use the local Electron API
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
        if(fileInputRef.current) fileInputRef.current.value = "";
        setBulkFile(null);
      }
    };
    reader.readAsBinaryString(bulkFile);
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
        {/* The form JSX remains the same */}
        <TextField select name="role" label="Role" value={formData.role || ''} onChange={handleChange} fullWidth sx={{ mb: 2 }} required>
            <MenuItem value=""><em>Select a Role...</em></MenuItem>
            {roles.map(r => <MenuItem key={r.code} value={r.label}>{r.label}</MenuItem>)}
        </TextField>
        
        {mode === 'create' && regNoPreview && (
          <TextField
            label="Registration Number (Preview)" value={regNoPreview}
            InputProps={{ readOnly: true }}
            error={regNoPreview === 'Error'}
            helperText={regNoPreview === 'Error' ? 'Could not fetch preview. Is the kiosk assigned to an event?' : ''}
            fullWidth sx={{ mb: 2 }}
          />
        )}
        {mode === 'edit' && <TextField label="Registration Number" value={formData.regno || ''} InputProps={{ readOnly: true }} fullWidth sx={{ mb: 2 }} />}

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
        
        <DialogActions sx={{mt: 2, px: 0}}>
            <Button type="submit" variant="contained" disabled={loading || (mode === 'create' && (regNoPreview === 'Loading...' || regNoPreview === 'Error'))}>
                {loading ? <CircularProgress size={24}/> : (mode === 'edit' ? 'Update' : 'Register')}
            </Button>
            {onCancel && <Button variant="text" onClick={onCancel}>Cancel</Button>}
        </DialogActions>
    </form>
  );

  // The rest of the component's return logic remains the same
  if (mode === 'edit') {
    return (
      <Box sx={{ maxWidth: 600, m: 'auto', p: 2 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Edit Participant</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}
          {renderForm()}
        </Paper>
      </Box>
    );
  }
  
  return (
    <Box sx={{ maxWidth: 900, margin: 'auto', mt: 4 }}>
      <Paper>
          <Tabs value={tabIndex} onChange={(e, val) => setTabIndex(val)} centered>
            <Tab label="Single Registration" />
            <Tab label="Bulk Upload" />
          </Tabs>

        <TabPanel value={tabIndex} index={0}>
          <Box sx={{ p: 3 }}>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {successMsg && <Alert severity="success" sx={{mb: 2}}>{successMsg}</Alert>}
            {renderForm()}
          </Box>
        </TabPanel>

        <TabPanel value={tabIndex} index={1}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Bulk Upload Participants</Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {bulkResult && (
                <Alert 
                    severity={bulkResult.errors.length > 0 ? "warning" : "success"} 
                    sx={{mb: 2, whiteSpace: 'pre-wrap'}}
                >
                    <Typography variant="body1">
                        {`Upload Complete: ${bulkResult.inserted.length} inserted, ${bulkResult.skipped.length} skipped (duplicates), ${bulkResult.errors.length} failed.`}
                    </Typography>
                    {bulkResult.errors.length > 0 && (
                        <Box mt={1} sx={{maxHeight: 150, overflowY: 'auto'}}>
                            <Typography variant="body2">
                                <strong>Error Details:</strong>
                            </Typography>
                            {bulkResult.errors.map((e, i) => (
                                <Typography key={i} variant="caption" display="block">
                                    - Row for '{e.participant.name || e.participant.email}': {e.error}
                                </Typography>
                            ))}
                        </Box>
                    )}
                </Alert>
            )}
            <input ref={fileInputRef} type="file" onChange={handleBulkFileChange} accept=".xlsx,.xls,.csv" style={{ display: 'block', marginBottom: 16 }}/>
            <Button variant="contained" onClick={handleBulkUpload} disabled={bulkLoading || !bulkFile}>
              {bulkLoading ? <CircularProgress size={24} /> : 'Upload and Process File'}
            </Button>
            <Box sx={{ mt: 3, p: 2, border: '1px dashed grey', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Excel file must have a header row with these exact column names (case-sensitive):<br/>
                <code>name, role, email, phone, company, designation, country, paidStatus</code>
              </Typography>
            </Box>
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
}
