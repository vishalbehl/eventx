// src/renderer/component/ModeSelection.jsx
import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';

const ModeSelection = ({ onModeSelected }) => {
  const handleLocalMode = () => {
    onModeSelected('local');
  };

  const handleServerMode = () => {
    onModeSelected('server');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: 4,
        padding: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 300 }}
      >
        <Typography variant="h5" align="center">
          Select Application Mode
        </Typography>
        <Button variant="contained" color="primary" onClick={handleLocalMode}>
          Local Mode (SQLite)
        </Button>
        <Button variant="contained" color="secondary" onClick={handleServerMode}>
          Server Mode (MySQL/Postgres)
        </Button>
      </Paper>
      <Typography variant="body2" color="textSecondary" align="center">
        Local Mode stores data on this machine. Server Mode connects to a central database.
      </Typography>
    </Box>
  );
};

export default ModeSelection;
