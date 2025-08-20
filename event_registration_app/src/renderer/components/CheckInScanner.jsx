import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  const scannerRef = useRef(null);
  const readerId = "qr-reader-container";

  // --- REFACTORED ---
  const onScanSuccess = useCallback(async (decodedText) => {
    if (loading) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let regno;
      // Use the secure verifier from the Electron backend first
      const verificationResult = await window.electronAPI.verifyQRToken(decodedText);

      if (!verificationResult.success || !verificationResult.regno) {
        // If JWT verification fails, assume the raw text is the regno
        regno = decodedText.trim();
      } else {
        regno = verificationResult.regno;
      }

      if (!regno) {
        throw new Error('QR code did not contain a registration number.');
      }
      
      const eventId = user.assignedEventId;
      const participantResult = await window.electronAPI.getLocalParticipantByRegno(eventId, regno);
      
      if(!participantResult.success || !participantResult.participant) {
          throw new Error('Participant not found for this event.');
      }
      
      const participant = participantResult.participant;

      // Use the local Electron API for check-in
      const result = await window.electronAPI.addLocalCheckIn({ 
          eventId: eventId, 
          participantId: participant.id, 
          sessionId: selectedSessionId 
      });

      if (result.success && result.limit_reached) {
        setSuccess(`${participant.name} has reached the check-in limit.`);
      } else if (result.success) {
        setSuccess(`Welcome, ${participant.name}! (${participant.regno})`);
        setCheckedInList(prev => [{...participant, check_in_time: new Date().toISOString() }, ...prev]);
      } else {
        throw new Error(result.message || 'Check-in failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading, selectedSessionId, user]);

  // --- REFACTORED ---
  useEffect(() => {
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        const backCamera = devices.find(d => d.label.toLowerCase().includes('back'));
        setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
      }
    }).catch(() => { setError("Could not get camera devices. Please grant permissions."); });

    async function fetchSessions() {
      try {
        const eventId = user.assignedEventId;
        // Use the local Electron API
        const res = await window.electronAPI.getSessions(eventId);
        if (res.success && res.sessions) {
          setSessions(res.sessions);
          if (res.sessions.length > 0) {
            setSelectedSessionId(res.sessions[0].id);
          }
        } else { setError("Could not load event sessions."); }
      } catch {
        setError("Server error while fetching sessions.");
      }
    }
    fetchSessions();
  }, [user]);

  // --- REFACTORED ---
  useEffect(() => {
    const fetchCheckedInList = async () => {
      if (!selectedSessionId) { setCheckedInList([]); return; }
      try {
        const eventId = user.assignedEventId;
        // Use the local Electron API
        const res = await window.electronAPI.getLocalCheckins(eventId, selectedSessionId);
        setCheckedInList(res.success ? (res.checkIns || []) : []);
      } catch {
        setCheckedInList([]);
      }
    };
    fetchCheckedInList();
  }, [selectedSessionId, user]);

  // The scanner start/stop useEffect remains the same
  useEffect(() => {
    if (!isScanning) return;
    const html5QrcodeScanner = new Html5Qrcode(readerId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrcodeScanner.start(
        selectedCameraId,
        config,
        onScanSuccess,
        (errorMessage) => { console.error(`QR Code scan error: ${errorMessage}`); }
    ).catch((err) => {
        console.error("Could not start scanner:", err);
        setError(`Camera Error: ${err.message}.`);
        setIsScanning(false);
    });

    return () => {
      if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop()
          .then(() => {
            html5QrcodeScanner.clear();
            console.log("Scanner stopped and cleared.");
          })
          .catch((err) => console.error("Failed to stop scanner.", err));
      }
    };
  }, [isScanning, selectedCameraId, onScanSuccess]);

  const selectedSessionName = sessions.find(s => s.id === selectedSessionId)?.name || "N/A";

  // The rest of the component's return logic remains the same
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

        <Box id={readerId} sx={{ width: '100%', maxWidth: '500px', margin: 'auto', mb: 2, display: isScanning ? 'block' : 'none', "& > span": {display: 'none'} }} />

        <Button 
          variant="contained" 
          onClick={() => setIsScanning(prev => !prev)} 
          disabled={!selectedSessionId || !selectedCameraId} 
          color={isScanning ? "error" : "primary"} 
          fullWidth sx={{mb: 2}}
        >
          {isScanning ? 'Stop Scanning' : 'Start Scanning'}
        </Button>

        <Box sx={{ minHeight: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {loading && <CircularProgress />}
          {error && <Alert severity="error" variant="filled" onClose={() => setError('')}><Typography variant="h6">{error}</Typography></Alert>}
          {success && <Alert severity="success" variant="filled" onClose={() => setSuccess('')}><Typography variant="h6">{success}</Typography></Alert>}
          {!loading && !error && !success && (<Alert severity="info" icon={<CameraAltIcon />}>{isScanning ? "Point camera at a QR code." : "Scanner is idle. Click 'Start Scanning' to begin."}</Alert>)}
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
