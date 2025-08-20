// FileName: MultipleFiles/PrintPreview.jsx
// ===== PrintDesigner.jsx =====
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Paper, Alert, Switch, FormControlLabel } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { QRCodeSVG } from 'qrcode.react';
import { apiClient } from '../App';

// Renders a single badge/certificate page
const PrintableItem = ({ template, participant, debugMode }) => {
  const { template_data } = template;
  if (!template_data) return <Alert severity="error">Template data is missing.</Alert>;

  const tokenReplace = (text) => {
    if (!text) return '';
    return text
      .replaceAll('{{name}}', participant.name || '')
      .replaceAll('{{regno}}', participant.regno || '')
      .replaceAll('{{role}}', participant.role || '')
      .replaceAll('{{company}}', participant.company || '')
      .replaceAll('{{date}}', new Date().toLocaleDateString('en-IN'));
  };

  const pageLayout = template_data.pages[0];

  // Generate QR code value - ensure consistency
  const getQRValue = (field) => {
    if (participant?.jwtToken) {
      return participant.jwtToken;
    }
    
    // Fallback: create a simple JSON structure
    const qrData = {
      regno: participant.regno,
      name: participant.name,
      timestamp: new Date().toISOString()
    };
    
    return JSON.stringify(qrData);
  };

  return (
    <Paper
      className="printable-page"
      elevation={3}
      sx={{
        width: `${template_data.width_mm}mm`,
        height: `${template_data.height_mm}mm`,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: pageLayout.print_backgroundColor ? pageLayout.backgroundColor : '#FFFFFF',
        backgroundImage: pageLayout.print_backgroundImage && pageLayout.backgroundImage ? `url(${pageLayout.backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        pageBreakAfter: 'always',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: `${pageLayout.margin_top_mm}mm`,
          left: `${pageLayout.margin_left_mm}mm`,
          right: `${pageLayout.margin_right_mm}mm`,
          bottom: `${pageLayout.margin_bottom_mm}mm`,
        }}
      >
        {pageLayout.fields.map((field) => (
          <Box
            key={field.id}
            sx={{
              position: 'absolute',
              left: `${field.x_mm}mm`,
              top: `${field.y_mm}mm`,
              width: `${field.width_mm}mm`,
              height: `${field.height_mm}mm`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: field.align || 'left',
              fontFamily: field.fontFamily,
              fontSize: `${field.fontSize}pt`,
              color: field.color,
              fontWeight: field.bold ? 'bold' : 'normal',
              fontStyle: field.italic ? 'italic' : 'normal',
              textDecoration: field.underline ? 'underline' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {field.type === 'qr' ? (
              <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QRCodeSVG
                  value={getQRValue(field)}
                  size={Math.min(field.width_mm * 3.78, field.height_mm * 3.78)} // Convert mm to pixels roughly
                  level="M" // Changed from "L" to "M" for consistency
                  includeMargin={false}
                  fgColor={field.color || '#000000'}
                  bgColor={field.bgColor || '#FFFFFF'}
                />
                {debugMode && (
                  <Box sx={{ position: 'absolute', bottom: -20, fontSize: '8px', color: 'red' }}>
                    QR: {getQRValue(field).substring(0, 30)}...
                  </Box>
                )}
              </Box>
            ) : (
              tokenReplace(field.placeholder)
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default function PrintDesigner() {
  const [searchParams] = useSearchParams();
  const [template, setTemplate] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    const fetchPrintData = async () => {
      const type = searchParams.get('type'); // 'badge' or 'certificate'
      const ids = searchParams.get('participantIds');

      if (!ids) {
        setError('No participants specified.');
        setLoading(false);
        return;
      }

      try {
        // 1. Fetch participants
        const participantsRes = await apiClient.async_get(`/participants/byIds?ids=${ids}`);
        if (!participantsRes.success || participantsRes.participants.length === 0) {
          throw new Error('Could not find the specified participants.');
        }
        const fetchedParticipants = participantsRes.participants;

        // 2. Generate JWT tokens via Electron API (with better error handling)
        for (let i = 0; i < fetchedParticipants.length; i++) {
          try {
            if (window.electronAPI && window.electronAPI.generateQRCode) {
              const res = await window.electronAPI.generateQRCode(fetchedParticipants[i]);
              if (res.success && res.token) {
                fetchedParticipants[i].jwtToken = res.token;
                if (debugMode) console.log(`Generated JWT for ${fetchedParticipants[i].regno}:`, res.token);
              } else {
                throw new Error('JWT generation failed');
              }
            } else {
              throw new Error('Electron API not available');
            }
          } catch (jwtError) {
            console.warn(`Failed to generate JWT for ${fetchedParticipants[i].regno}:`, jwtError);
            // Create a fallback structured QR data
            const fallbackData = {
              regno: fetchedParticipants[i].regno,
              name: fetchedParticipants[i].name,
              id: fetchedParticipants[i].id,
              timestamp: new Date().toISOString()
            };
            fetchedParticipants[i].jwtToken = JSON.stringify(fallbackData);
          }
        }
        
        setParticipants(fetchedParticipants);

        // 3. Get event to determine template
        const eventId = fetchedParticipants[0].event_id;
        const eventRes = await apiClient.async_get(`/events/${eventId}`);
        if (!eventRes.success) throw new Error('Could not find event details.');

        const templateId = type === 'badge'
          ? eventRes.details.badge_template_id
          : eventRes.details.certificate_template_id;
        if (!templateId) throw new Error(`No default "${type}" template has been set for this event.`);

        // 4. Fetch template
        const templateRes = await apiClient.async_get(`/print-templates/${templateId}`);
        if (!templateRes.success) throw new Error('Could not load the print template.');
        setTemplate(templateRes.template);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPrintData();
  }, [searchParams, debugMode]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <style>
        {`
          @media print {
              body * {
                  visibility: hidden;
              }
              .print-container, .print-container * {
                  visibility: visible;
              }
              .print-container {
                  position: absolute;
                  left: 0;
                  top: 0;
              }
              .printable-page {
                  box-shadow: none !important;
                  margin: 0;
              }
              .no-print {
                  display: none !important;
              }
          }
        `}
      </style>

      <Paper className="no-print" sx={{ p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Print Preview ({participants.length} items)</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
            }
            label="Debug Mode"
          />
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print Now
          </Button>
        </Box>
      </Paper>

      {debugMode && (
        <Paper className="no-print" sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
          <Typography variant="h6">Debug Information:</Typography>
          <Typography variant="body2">Template: {template?.name}</Typography>
          <Typography variant="body2">Participants: {participants.length}</Typography>
          <Typography variant="body2">QR Generation Method: {window.electronAPI ? 'Electron API' : 'Fallback JSON'}</Typography>
          {participants.slice(0, 2).map(p => (
            <Box key={p.id} sx={{ mt: 1, p: 1, border: '1px solid #ddd' }}>
              <Typography variant="caption">
                {p.regno}: {p.jwtToken ? p.jwtToken.substring(0, 50) + '...' : 'No token'}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}

      <Box className="print-container" sx={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
        {participants.map(p => (
          <PrintableItem key={p.id} template={template} participant={p} debugMode={debugMode} />
        ))}
      </Box>
    </Box>
  );
}
