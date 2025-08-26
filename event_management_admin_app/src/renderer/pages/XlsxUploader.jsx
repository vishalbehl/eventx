import React, { useState } from 'react';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import * as XLSX from 'xlsx';

const requiredColumns = ['role', 'name', 'designation', 'email', 'phone', 'company', 'paidStatus', 'country'];

export default function XlsxUploader({ onUpload }) {
  const [file, setFile] = useState(null);
  const [dataPreview, setDataPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setDataPreview(null);
    setError('');
    setSuccessMsg('');
  };

  // Parse file and preview data
  const parseFile = () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError('');
    setDataPreview(null);
    setSuccessMsg('');

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        // Validate columns presence in first row
        if (jsonData.length === 0) {
          setError('Excel sheet is empty');
          setLoading(false);
          return;
        }

        const missingCols = requiredColumns.filter(col => !(col in jsonData[0]));
        if (missingCols.length > 0) {
          setError(`Missing columns: ${missingCols.join(', ')}`);
          setLoading(false);
          return;
        }

        setDataPreview(jsonData);
        setLoading(false);
      } catch (err) {
        setError('Failed to parse file: ' + err.message);
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setLoading(false);
    };

    reader.readAsBinaryString(file);
  };

  // Trigger bulk upload callback
  const handleUpload = () => {
    if (!dataPreview) {
      setError('No parsed data to upload. Please parse a file first.');
      return;
    }
    setLoading(true);
    onUpload(dataPreview)
      .then(() => {
        setSuccessMsg('Bulk upload successful');
        setLoading(false);
        setFile(null);
        setDataPreview(null);
      })
      .catch((err) => {
        setError('Upload failed: ' + err.message);
        setLoading(false);
      });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Upload Excel / CSV file
      </Typography>

      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
      <Box mt={2}>
        <Button variant="outlined" onClick={parseFile} disabled={loading || !file}>
          {loading ? 'Parsing...' : 'Parse File'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {successMsg && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {successMsg}
        </Alert>
      )}

      {dataPreview && (
        <Box mt={3}>
          <Typography variant="subtitle1">Preview (first 5 rows):</Typography>
          <pre style={{ maxHeight: 200, overflowY: 'auto', backgroundColor: '#f4f4f4', padding: 8 }}>
            {JSON.stringify(dataPreview.slice(0, 5), null, 2)}
          </pre>

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={loading}
            sx={{ mt: 2 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Upload Data'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
