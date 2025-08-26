import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Alert, CircularProgress } from '@mui/material';
import { apiClient } from '../api/apiClient'; // This now correctly points to your central server client

export default function SignIn({ onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // --- THIS IS THE CORRECTED LOGIC ---
      // Authenticate against the central server to get a valid token
      const result = await apiClient.async_post('/auth/login', { username, password });
      
      if (result.success) {
        // onSignIn saves the token to localStorage and sets the user state in App.jsx
        onSignIn(result.token);
      } else {
        setError(result.message || 'Login failed.');
      }
    } catch (err) {
      setError('Connection error. Is the central server running?');
    } finally {
      setLoading(false);
    }
  };

  // The component's return JSX remains the same.
  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f5f5' }}>
      <Paper sx={{ p: 4, width: 320, textAlign: 'center' }}>
        <Typography variant="h5" mb={2}>Sign In</Typography>
        {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}
        <form onSubmit={handleSubmit}>
          <TextField
            label="Username"
            fullWidth
            required
            margin="normal"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            required
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 2, minHeight: '40px' }} disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Sign In'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
