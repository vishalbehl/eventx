// src/renderer/component/ServerDbSetup.jsx
import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert, CircularProgress, MenuItem, Select, FormControl, InputLabel } from '@mui/material';

const ServerDbSetup = ({ onSetupComplete, onGoBack }) => {
  const [dbType, setDbType] = useState('mysql'); // 'mysql' or 'postgres'
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(3306);
  const [dbName, setDbName] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCreateDb = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.createServerDb({
        dbType,
        host,
        port,
        dbName,
        user,
        password,
      });

      if (result.success) {
        onSetupComplete({ mode: 'server', dbType, host, port, dbName, user, password });
      } else {
        setError(result.message || 'Failed to create server database');
      }
    } catch (err) {
      console.error(err);
      setError('Error connecting to server: ' + err.message);
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
          Setup Server Database
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <FormControl fullWidth>
          <InputLabel>Database Type</InputLabel>
          <Select
            value={dbType}
            onChange={(e) => {
              setDbType(e.target.value);
              setPort(e.target.value === 'mysql' ? 3306 : 5432);
            }}
          >
            <MenuItem value="postgres">PostgreSQL</MenuItem>
            <MenuItem value="mysql">MySQL</MenuItem>
          </Select>
        </FormControl>

        <TextField label="Host" value={host} onChange={(e) => setHost(e.target.value)} fullWidth />
        <TextField label="Port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} fullWidth />
        <TextField label="Database Name" value={dbName} onChange={(e) => setDbName(e.target.value)} fullWidth />
        <TextField label="Username" value={user} onChange={(e) => setUser(e.target.value)} fullWidth />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />

        <Button variant="contained" color="primary" onClick={handleCreateDb} disabled={loading}>
          {loading ? <CircularProgress size={24} /> : 'Create Database & Tables'}
        </Button>
        <Button variant="outlined" color="secondary" onClick={onGoBack}> Back </Button>
      </Paper>

      <Typography variant="body2" color="textSecondary" align="center">
        This will connect to your server database, create the database and tables automatically.
      </Typography>
    </Box>
  );
};

export default ServerDbSetup;
