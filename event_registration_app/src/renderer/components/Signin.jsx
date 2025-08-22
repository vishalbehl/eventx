import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert, Chip } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';

export default function SignIn({ onSignIn, onResetApp }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [networkInfo, setNetworkInfo] = useState([]);
  // ***** 1. ADD NEW STATE to control visibility *****
  const [showNetworkInfo, setShowNetworkInfo] = useState(false);

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
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.loginUser(username, password);
      if (result?.success) {
        onSignIn(result.token);
      } else {
        setError(result?.message || 'Login failed');
      }
    } catch (err) {
      console.error(err);
      setError('Login error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Paper sx={{ p: 4, width: 400 }}>
        <Typography variant="h5" gutterBottom>Kiosk Admin Login</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <form onSubmit={handleSubmit}>
          <TextField 
            label="Username" 
            fullWidth 
            margin="normal" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
          />
          <TextField 
            label="Password" 
            type="password" 
            fullWidth 
            margin="normal" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
          />
          <Box sx={{ mt: 2, position: 'relative' }}>
            <Button 
              type="submit" 
              fullWidth 
              variant="contained" 
              color="primary" 
              disabled={loading}
            >
              Login
            </Button>
            {loading && (
              <CircularProgress 
                size={24} 
                sx={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  marginTop: '-12px', 
                  marginLeft: '-12px' 
                }} 
              />
            )}
          </Box>
        </form>

        {/* ***** 2. ADD A TOGGLE BUTTON ***** */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button 
                variant="outlined" 
                size="small" 
                onClick={() => setShowNetworkInfo(!showNetworkInfo)}
            >
                {showNetworkInfo ? 'Hide' : 'Show'} System Information
            </Button>
        </Box>

        {/* ***** 3. CONDITIONALLY RENDER the network info box ***** */}
        {showNetworkInfo && (
            <Box sx={{ mt: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1 }}>
                    Device Network Information
                </Typography>
                {networkInfo.length > 0 ? (
                    networkInfo.map(net => (
                        <Box key={net.mac} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            {net.name.toLowerCase().includes('WiFi') || net.name.toLowerCase().includes('wlan')
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

        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Having trouble or need to change the database?
          </Typography>
          <Button 
            variant="text" 
            size="small" 
            onClick={onResetApp}
            sx={{ mt: 0.5 }}
          >
            Reset Configuration
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}