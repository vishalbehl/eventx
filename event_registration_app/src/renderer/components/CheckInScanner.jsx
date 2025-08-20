import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Alert, CircularProgress, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, FormControl, InputLabel, Select, MenuItem, Grid
} from '@mui/material';
import { Html5Qrcode } from 'html5-qrcode';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

export default function CheckInScanner({ user }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [checkedInList, setCheckedInList] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const readerId = "qr-reader-container";

  const onScanSuccess = useCallback(async (decodedText) => {
    if (loading) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // The backend will handle verification and check-in in one go
      const checkinPayload = {
        qrData: decodedText,
        sessionId: selectedSessionId,
        eventId: user.assignedEventId,
      };

      // Use a single, unified IPC handler for check-ins
      const result = await window.electronAPI.processCheckIn(checkinPayload);

      if (result.success) {
        const participant = result.participant;
        // Handle different success messages from the backend
        if (result.limit_reached) {
          setSuccess(`Check-in limit reached for ${participant.name} (${participant.regno}).`);
        } else if (result.already_checked_in) {
            setSuccess(`${participant.name} (${participant.regno}) is already checked in for this session.`);
        }
        else {
          setSuccess(`Welcome, ${participant.name}! (${participant.regno})`);
        }
        // Refresh the list to show the new check-in
        fetchCheckedInList(selectedSessionId);
      } else {
        throw new Error(result.message || 'Check-in failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading, selectedSessionId, user]);

  const fetchSessions = useCallback(async () => {
    try {
      if (!user?.assignedEventId) return;
      const result = await window.electronAPI.getSessions(user.assignedEventId);
      if (result.success && result.sessions) {
        setSessions(result.sessions);
        if (result.sessions.length > 0 && !selectedSessionId) {
          setSelectedSessionId(result.sessions[0].id);
        }
      } else {
        setError("Could not load event sessions.");
      }
    } catch (err) {
      setError("Error while fetching sessions.");
    }
  }, [user, selectedSessionId]);

  const fetchCheckedInList = useCallback(async (sessionId) => {
    if (!sessionId) {
      setCheckedInList([]);
      return;
    }
    try {
      const result = await window.electronAPI.getCheckIns(sessionId);
      setCheckedInList(result.success ? (result.checkIns || []) : []);
    } catch (err) {
      setCheckedInList([]);
      console.error("Failed to fetch check-in list:", err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        const backCamera = devices.find(d => d.label.toLowerCase().includes('back'));
        setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
      }
    }).catch(() => { setError("Could not get camera devices. Please grant permissions."); });
  }, [fetchSessions]);

  useEffect(() => {
    fetchCheckedInList(selectedSessionId);
  }, [selectedSessionId, fetchCheckedInList]);

  useEffect(() => {
    let html5QrcodeScanner;
    if (isScanning && selectedCameraId) {
      html5QrcodeScanner = new Html5Qrcode(readerId);
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      html5QrcodeScanner.start(
        selectedCameraId, config, onScanSuccess,
        (errorMessage) => { /* console.log(errorMessage) */ }
      ).catch((err) => {
        setError(`Camera Error: ${err.message}.`);
        setIsScanning(false);
      });
    }

    return () => {
      if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch((err) => console.error("Failed to stop scanner.", err));
      }
    };
  }, [isScanning, selectedCameraId, onScanSuccess]);

  const selectedSessionName = sessions.find(s => s.id === selectedSessionId)?.name || "N/A";

  return (
    <Box sx={{ maxWidth: 800, margin: 'auto', mt: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Session Check-In</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={8}>
            <FormControl fullWidth>
              <InputLabel>Select Session</InputLabel>
              <Select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)} disabled={isScanning || sessions.length === 0}>
                {sessions.map((session) => (
                  <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Select Camera</InputLabel>
              <Select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} disabled={isScanning || cameras.length === 0}>
                {cameras.map((camera) => (
                  <MenuItem key={camera.id} value={camera.id}>{camera.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box id={readerId} sx={{ width: '100%', maxWidth: '500px', margin: 'auto', mb: 2, display: isScanning ? 'block' : 'none' }} />

        <Button
          variant="contained"
          onClick={() => setIsScanning(prev => !prev)}
          disabled={!selectedSessionId || !selectedCameraId}
          color={isScanning ? "error" : "primary"}
          fullWidth sx={{ mb: 2 }}
        >
          {isScanning ? 'Stop Scanning' : 'Start Scanning'}
        </Button>

        <Box sx={{ minHeight: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {loading && <CircularProgress />}
          {error && <Alert severity="error" variant="filled" onClose={() => setError('')}><Typography variant="h6">{error}</Typography></Alert>}
          {success && <Alert severity="success" variant="filled" onClose={() => setSuccess('')}><Typography variant="h6">{success}</Typography></Alert>}
          {!loading && !error && !success && (<Alert severity="info" icon={<CameraAltIcon />}>{isScanning ? "Point camera at a QR code." : "Scanner is idle."}</Alert>)}
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mt: 4 }}>
        <Typography variant="h6" gutterBottom>Checked-in for: {selectedSessionName}</Typography>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead><TableRow><TableCell>Reg No</TableCell><TableCell>Name</TableCell><TableCell>Time</TableCell></TableRow></TableHead>
            <TableBody>
              {checkedInList.length === 0 ? (<TableRow><TableCell colSpan={3} align="center">No check-ins for this session yet.</TableCell></TableRow>) : (checkedInList.map((p, index) => (
                <TableRow key={`${p.id}-${index}`}><TableCell>{p.regno}</TableCell><TableCell>{p.name}</TableCell><TableCell>{new Date(p.check_in_time).toLocaleTimeString()}</TableCell></TableRow>
              )))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
