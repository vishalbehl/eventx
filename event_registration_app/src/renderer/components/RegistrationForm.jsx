import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Tabs, Tab, TextField, Button, Typography, MenuItem,
  Alert, Paper, CircularProgress, DialogActions
} from '@mui/material';
import * as XLSX from 'xlsx';

const countries = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'China', 'Other'
];
const paidOptions = ['Paid', 'Unpaid'];

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ p: 3 }}>{children}</Box> : null;
}

export default function RegistrationForm({ mode = 'create', initialData = {}, onSubmit, onCancel, user }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [formData, setFormData] = useState({
    role: '', name: '', designation: '', phone: '', email: '',
    company: '', paidStatus: 'Unpaid', country: 'India', regno: ''
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

  // Fetch roles dynamically
  useEffect(() => {
    async function fetchRoles() {
      if (!user?.assignedEventId) return;
      try {
        const result = await window.electronAPI.getEventRoles(user.assignedEventId);
        if (result.success && result.roles?.length) {
          setRoles(result.roles);
          const defaultRole = result.roles.find(r => r.isDefault);
          if (defaultRole) setFormData(prev => ({ ...prev, role: defaultRole.name }));
        } else setRoles([]);
      } catch (err) {
        console.error('Error fetching roles:', err);
        setRoles([]);
      }
    }
    fetchRoles();
  }, [user]);

  // Edit mode form population
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setFormData({
        role: initialData.role || '',
        name: initialData.name || '',
        designation: initialData.designation || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        company: initialData.company || '',
        paidStatus: initialData.paid_status || 'Unpaid',
        country: initialData.country || 'India',
        regno: initialData.regno || ''
      });
    }
  }, [mode, initialData]);

  // Registration number preview
  useEffect(() => {
    if (mode === 'edit' || !formData.role || !user?.assignedEventId || roles.length === 0) {
      setRegNoPreview('');
      return;
    }
    let isMounted = true;
    async function fetchRegNoPreview() {
      try {
        setRegNoPreview('Loading...');
        const roleObj = roles.find(r => r.name === formData.role);
        if (!roleObj) {
          if (isMounted) setRegNoPreview('Invalid role selected');
          return;
        }
        const result = await window.electronAPI.getNextRegNo(user.assignedEventId, roleObj.code);
        if (isMounted) setRegNoPreview(result.success ? result.regno : 'Error');
      } catch (err) {
        if (isMounted) setRegNoPreview('Error');
      }
    }
    fetchRegNoPreview();
    return () => { isMounted = false; }
  }, [formData.role, mode, user, roles]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const isEdit = mode === 'edit';
      const payload = {
        ...formData,
        event_id: user.assignedEventId,
        source: 'offline',
        registered_at: isEdit ? initialData.registered_at : new Date().toISOString()
      };
      if (!isEdit) payload.regno = regNoPreview;
      const result = isEdit
        ? await window.electronAPI.updateParticipant(initialData.id, payload)
        : await window.electronAPI.addParticipant(payload);
      if (!result.success) throw new Error(result.message || 'An unknown error occurred');
      const finalParticipant = result.participant;
      setSuccessMsg(isEdit ? 'Participant updated successfully!' : `Registered! Reg No: ${finalParticipant.regno}`);
      if (!isEdit) {
        setFormData({ role: '', name: '', designation: '', phone: '', email: '', company: '', paidStatus: 'Unpaid', country: 'India', regno: '' });
      }
      if (onSubmit) onSubmit(finalParticipant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
      setError('');
      setBulkResult(null);
    }
  };

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

        // Validate roles
        const allowedRoleNames = roles.map(r => r.name);
        for (let i = 0; i < jsonData.length; i++) {
          if (!allowedRoleNames.includes(jsonData[i].role)) {
            throw new Error(`Row ${i + 2}: Invalid role '${jsonData[i].role}'. Allowed roles: ${allowedRoleNames.join(', ')}`);
          }
        }

        const result = await window.electronAPI.addBulkParticipants(user.assignedEventId, jsonData);
        if (result.success) setBulkResult(result.result);
        else throw new Error(result.message || 'Bulk upload failed.');
      } catch (err) {
        setError(err.message);
      } finally {
        setBulkLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setBulkFile(null);
      }
    };
    reader.readAsBinaryString(bulkFile);
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField select name="role" label="Role" value={formData.role} onChange={handleChange} required>
          <MenuItem value=""><em>Select a Role...</em></MenuItem>
          {roles.map(r => <MenuItem key={r.code} value={r.name}>{r.name}</MenuItem>)}
        </TextField>
        {mode === 'create' && (
          <TextField label="Registration Number (Preview)" value={regNoPreview || 'Select a role to generate'}
            InputProps={{ readOnly: true }}
            error={regNoPreview === 'Error'}
            helperText={regNoPreview === 'Error' ? 'Could not fetch preview.' : ''}
          />
        )}
        {mode === 'edit' && <TextField label="Registration Number" value={formData.regno} InputProps={{ readOnly: true }} />}
        <TextField label="Name" name="name" value={formData.name} onChange={handleChange} required />
        <TextField label="Phone" name="phone" value={formData.phone} onChange={handleChange} />
        <TextField label="Email" name="email" value={formData.email} onChange={handleChange} type="email" />
        <TextField label="Company" name="company" value={formData.company} onChange={handleChange} />
        <TextField label="Designation" name="designation" value={formData.designation} onChange={handleChange} />
        <TextField select name="country" label="Country" value={formData.country} onChange={handleChange}>
          {countries.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField select name="paidStatus" label="Paid Status" value={formData.paidStatus} onChange={handleChange}>
          {paidOptions.map(opt => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
        </TextField>
        <DialogActions sx={{ mt: 1, px: 0 }}>
          {onCancel && <Button variant="text" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" variant="contained" disabled={loading || (mode === 'create' && (!regNoPreview || regNoPreview === 'Loading...' || regNoPreview === 'Error'))}>
            {loading ? <CircularProgress size={24} /> : (mode === 'edit' ? 'Update Participant' : 'Register Participant')}
          </Button>
        </DialogActions>
      </Box>
    </form>
  );

  return (
    <Box sx={{ maxWidth: 1000, margin: 'auto', mt: 2 }}>
      <Paper>
        <Tabs value={tabIndex} onChange={(e, val) => setTabIndex(val)} centered>
          <Tab label="Single Registration" />
          <Tab label="Bulk Upload from Excel" />
        </Tabs>

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
              <Alert
                severity={bulkResult.errors > 0 ? "warning" : "success"}
                sx={{ mb: 2, whiteSpace: 'pre-wrap' }}
              >
                {`Upload Complete: ${bulkResult.inserted} inserted, ${bulkResult.skipped} skipped (duplicates), ${bulkResult.errors} failed.`}
              </Alert>
            )}
            <input ref={fileInputRef} type="file" onChange={handleBulkFileChange} accept=".xlsx,.xls,.csv" style={{ display: 'block', marginBottom: 16 }} />
            <Button variant="contained" onClick={handleBulkUpload} disabled={bulkLoading || !bulkFile}>
              {bulkLoading ? <CircularProgress size={24} /> : 'Upload and Process File'}
            </Button>
            <Box sx={{ mt: 3, p: 2, border: '1px dashed grey', borderRadius: 1 }}>
              <Typography variant="body2" color="textSecondary">
                Excel must have header row: <code>name, role, email, phone, company, designation, country, paidStatus</code><br/>
                Roles must match allowed roles for the event.
              </Typography>
            </Box>
          </Box>
        </TabPanel>
      </Paper>
    </Box>
  );
}
