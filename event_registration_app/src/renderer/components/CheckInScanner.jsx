import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Alert, CircularProgress, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, FormControl, InputLabel, Select, MenuItem, Grid
} from '@mui/material';
import { Html5Qrcode } from 'html5-qrcode';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

export default function CheckInScanner({ user }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerState, setScannerState] = useState('idle');
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [checkedInList, setCheckedInList] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const html5QrcodeScannerRef = useRef(null);
  const readerId = "qr-reader-container";

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

  const onScanSuccess = useCallback(async (decodedText) => {
    if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
        try { await html5QrcodeScannerRef.current.stop(); }
        catch (err) { console.error("Error stopping the scanner:", err); }
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const checkinPayload = {
        qrData: decodedText,
        sessionId: selectedSessionId,
        eventId: user.assignedEventId,
      };

      const result = await window.electronAPI.processCheckIn(checkinPayload);

      if (result.success) {
        const participant = result.participant;
        if (result.limit_reached) {
          setSuccess(`Check-in limit reached for ${participant.name} (${participant.regno}).`);
        } else if (result.already_checked_in) {
          setSuccess(`${participant.name} (${participant.regno}) is already checked in.`);
        } else {
          setSuccess(`Welcome, ${participant.name}! (${participant.regno})`);
        }
        // This is the key line that updates the table below
        fetchCheckedInList(selectedSessionId);
      } else {
        throw new Error(result.message || 'Check-in failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setScannerState('result');
    }
  }, [selectedSessionId, user, fetchCheckedInList]);

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
    if (scannerState === 'scanning' && selectedCameraId) {
      html5QrcodeScannerRef.current = new Html5Qrcode(readerId);
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      html5QrcodeScannerRef.current.start(
        selectedCameraId, config, onScanSuccess,
        () => {}
      ).catch((err) => {
        setError(`Camera Error: ${err.message}. Please ensure permissions are granted.`);
        setScannerState('idle');
      });
    }

    return () => {
      if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
        html5QrcodeScannerRef.current.stop().catch((err) => console.error("Failed to stop scanner on cleanup.", err));
      }
    };
  }, [scannerState, selectedCameraId, onScanSuccess]);

  const handleScanNext = () => {
    setError('');
    setSuccess('');
    setScannerState('scanning');
  };

  const selectedSessionName = sessions.find(s => s.id === selectedSessionId)?.name || "N/A";

  return (
    <Box sx={{ maxWidth: 800, margin: 'auto', mt: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Session Check-In</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={8}>
            <FormControl fullWidth>
              <InputLabel>Select Session</InputLabel>
              <Select value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)} disabled={scannerState === 'scanning' || sessions.length === 0} >
                {sessions.map((session) => (
                  <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth>
              <InputLabel>Select Camera</InputLabel>
              <Select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} disabled={scannerState === 'scanning' || cameras.length === 0}>
                {cameras.map((camera) => (
                  <MenuItem key={camera.id} value={camera.id}>{camera.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Box id={readerId} sx={{ width: '100%', maxWidth: '500px', margin: 'auto', mb: 2, display: scannerState === 'scanning' ? 'block' : 'none' }} />

        <Box sx={{ mb: 2 }}>
            {scannerState === 'idle' && (
                <Button variant="contained" onClick={() => setScannerState('scanning')} disabled={!selectedSessionId || !selectedCameraId} fullWidth>
                    Start Scanning
                </Button>
            )}
            {scannerState === 'scanning' && (
                <Button variant="contained" color="error" onClick={() => setScannerState('idle')} fullWidth>
                    Stop Scanning
                </Button>
            )}
            {scannerState === 'result' && (
                <Button variant="contained" onClick={handleScanNext} fullWidth startIcon={<QrCodeScannerIcon />}>
                    Scan Next Participant
                </Button>
            )}
        </Box>

        <Box sx={{ minHeight: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {loading && <CircularProgress />}
          {error && <Alert severity="error" variant="filled" onClose={() => setError('')}><Typography variant="h6">{error}</Typography></Alert>}
          {success && <Alert severity="success" variant="filled" onClose={() => setSuccess('')}><Typography variant="h6">{success}</Typography></Alert>}
          {!loading && !error && !success && scannerState !== 'scanning' && (
            <Alert severity="info" icon={<CameraAltIcon />}>Scanner is idle. Click 'Start Scanning' to begin.</Alert>
          )}
        </Box>
      </Paper>

      <Paper sx={{ p: 2, mt: 4 }}>
        <Typography variant="h6" gutterBottom>Checked-in for: {selectedSessionName} ({checkedInList.length})</Typography>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead><TableRow><TableCell>Reg No</TableCell><TableCell>Name</TableCell><TableCell>Time</TableCell></TableRow></TableHead>
            <TableBody>
              {checkedInList.length === 0 ? (<TableRow><TableCell colSpan={3} align="center">No check-ins for this session yet.</TableCell></TableRow>) : (checkedInList.map((p, index) => (
                <TableRow key={`${p.id}-${index}`} sx={{ backgroundColor: index === 0 ? '#e8f5e9' : 'inherit' }}>
                    <TableCell>{p.regno}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{new Date(p.check_in_time).toLocaleTimeString()}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}