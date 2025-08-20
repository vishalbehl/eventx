import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert, CircularProgress } from '@mui/material';

const LocalDbSetup = ({ onSetupComplete, onGoBack }) => {
  const [folderPath, setFolderPath] = useState('');
  const [dbName, setDbName] = useState('local.db');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI.selectLocalDbFolder();
      if (result.success) {
        setFolderPath(result.path); // FIX: use result.path, not the whole object
      } else {
        setError('Folder selection was canceled.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to select folder: ' + err.message);
    }
  };

  const handleCreateDb = async () => {
    if (!folderPath) {
      setError('Please select a folder for the database.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.createLocalDb({
        folderPath,
        dbName,
      });

      if (result.success) {
        onSetupComplete({ mode: 'local', dbFilePath: result.path });
      } else {
        setError(result.message || 'Failed to create local database');
      }
    } catch (err) {
      console.error(err);
      setError('Error creating local DB: ' + err.message);
    }

    setLoading(false);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 3,
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ p: 4, minWidth: 350, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h5" align="center">
          Setup Local Database
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <Button variant="outlined" onClick={handleSelectFolder}>
          {folderPath ? `Selected: ${folderPath}` : 'Select Folder'}
        </Button>

        <TextField
          label="Database Name"
          value={dbName}
          onChange={(e) => setDbName(e.target.value)}
          fullWidth
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button variant="outlined" color="secondary" onClick={onGoBack} fullWidth>
            Back
          </Button>

          <Button variant="contained" color="primary" onClick={handleCreateDb} disabled={loading} fullWidth>
            {loading ? <CircularProgress size={24} /> : 'Create Database & Tables'}
          </Button>
        </Box>
      </Paper>

      <Typography variant="body2" color="textSecondary" align="center">
        Local mode stores data on this machine.
      </Typography>
    </Box>
  );
};

export default LocalDbSetup;
