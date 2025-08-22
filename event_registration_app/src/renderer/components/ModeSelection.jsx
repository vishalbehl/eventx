import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';

const ModeSelection = ({ onModeSelected }) => {
  // --- 1. ADD STATE for network info and visibility ---
  const [networkInfo, setNetworkInfo] = useState([]);
  const [showNetworkInfo, setShowNetworkInfo] = useState(false);

  // --- 2. ADD useEffect to fetch the data when the component loads ---
  useEffect(() => {
    const fetchNetworkInfo = async () => {
        try {
            const info = await window.electronAPI.getNetworkInfo();
            setNetworkInfo(info || []);
        } catch (err) {
            console.error("Could not fetch network info:", err);
        }
    };
    fetchNetworkInfo();
  }, []); // Empty array ensures this runs only once

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
        gap: 2, // Reduced gap for better spacing
        padding: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 300, mb: 2 }}
      >
        <Typography variant="h5" align="center">
          Select Application Mode
        </Typography>
        <Button variant="contained" color="primary" onClick={handleLocalMode}>
          Local Mode (SQLite)
        </Button>
        <Button variant="contained" color="secondary" onClick={handleServerMode}>
          Server Mode (PostgreSQL)
        </Button>
      </Paper>
      <Typography variant="body2" color="textSecondary" align="center">
        Local Mode stores data on this machine. Server Mode connects to a central database.
      </Typography>

      {/* --- 3. ADD a toggle button and the conditional info box --- */}
      <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button 
              variant="outlined" 
              size="small" 
              onClick={() => setShowNetworkInfo(!showNetworkInfo)}
          >
              {showNetworkInfo ? 'Hide' : 'Show'} System Information
          </Button>
      </Box>

      {showNetworkInfo && (
          <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, minWidth: 300 }}>
              <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1 }}>
                  Device Network Information
              </Typography>
              {networkInfo.length > 0 ? (
                  networkInfo.map(net => (
                      <Box key={net.mac} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          {net.name.toLowerCase().includes('wi-fi') || net.name.toLowerCase().includes('wlan')
                              ? <WifiIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
                              : <SettingsEthernetIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
                          }
                          <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                                  {net.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                  IP: {net.ip} | MAC: {net.mac}
                              </Typography>
                          </Box>
                      </Box>
                  ))
              ) : (
                  <Typography variant="caption" color="text.secondary">No active network interfaces found.</Typography>
              )}
          </Box>
      )}
    </Box>
  );
};

export default ModeSelection;