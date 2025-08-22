import React, { useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, TableContainer, Table, TableHead,
  TableRow, TableCell, TableBody, CircularProgress, Alert
} from '@mui/material';
import { Doughnut, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
  LinearScale, PointElement, LineElement, Title,
} from 'chart.js';

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale,
  LinearScale, PointElement, LineElement, Title
);

export default function UserDashboard({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (!user?.assignedEventId) {
          setError('No event assigned to this user.');
          setLoading(false);
          return;
      }
      setLoading(true);
      setError('');
      try {
        // Use the new generic Electron API
        const res = await window.electronAPI.getDashboardStats(user.assignedEventId);
        if (res.success) {
          setData(res);
        } else {
          throw new Error(res.message || 'Failed to fetch dashboard data');
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setError('Failed to load dashboard data: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user]);

  const donutData = useMemo(() => {
    if (!data?.stats) return null;
    const { total_participants = 0, total_arrived = 0 } = data.stats;
    return {
      labels: ['Arrived', 'Remaining'],
      datasets: [{
        data: [total_arrived, total_participants - total_arrived],
        backgroundColor: ['#4caf50', '#e0e0e0'],
        borderColor: ['#ffffff', '#ffffff'],
        borderWidth: 2,
        hoverOffset: 4
      }],
    };
  }, [data]);

  const pieData = useMemo(() => {
    if (!data?.roles || data.roles.length === 0) return null;
    return {
      labels: data.roles.map((r) => r.role),
      datasets: [{ data: data.roles.map((r) => r.count), backgroundColor: ['#1976D2', '#DC004E', '#FF9800', '#388E3C', '#7B1FA2', '#FFEB3B', '#FF6C03', '#17F9D3', '#F44336', '#4CAF50', '#9C27B0', '#00BCD4', '#FF5722', '#673AB7', '#009688'], hoverOffset: 4 }],
    };
  }, [data]);
  
  const lineData = useMemo(() => {
    if (!data?.daywise || data.daywise.length === 0) return null;
    return {
      labels: data.daywise.map((d) => new Date(d.date).toLocaleDateString('en-IN')),
      datasets: [{ label: 'Registrations', data: data.daywise.map((d) => d.count), fill: false, borderColor: '#1976d2', backgroundColor: '#1976d2', tension: 0.2 }],
    };
  }, [data]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  const stats = data?.stats || {};

  return (
    <Box sx={{ p: 3 }}>
      {/* <Typography variant="h4" gutterBottom>Dashboard</Typography> */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Total Participants</Typography>
                <Typography variant="h4">{stats.total_participants ?? '0'}</Typography>
            </Paper>
        </Grid>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Total Arrived</Typography>
                <Typography variant="h4">{stats.total_arrived ?? '0'}</Typography>
            </Paper>
        </Grid>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Paid</Typography>
                <Typography variant="h4" color="green">{stats.total_paid ?? '0'}</Typography>
            </Paper>
        </Grid>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Unpaid</Typography>
                <Typography variant="h4" color="error">{stats.total_unpaid ?? '0'}</Typography>
            </Paper>
        </Grid>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Online Reg.</Typography>
                <Typography variant="h4">{stats.total_online ?? '0'}</Typography>
            </Paper>
        </Grid>
        <Grid item xs={6} md>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h5">Offline Reg.</Typography>
                <Typography variant="h4">{stats.total_offline ?? '0'}</Typography>
            </Paper>
        </Grid>
      </Grid>
      
      {/* --- Charts Section --- */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>Check-in Progress</Typography>
                <Box sx={{ flexGrow: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {donutData ? <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' } } }} /> : <Typography>No data</Typography>}
                </Box>
            </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom>Role-wise Registrations</Typography>
                 <Box sx={{ flexGrow: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pieData ? <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} /> : <Typography>No role data</Typography>}
                </Box>
            </Paper>
        </Grid>

        <Grid item xs={12}>
            <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom>Daily Registrations</Typography>
                <Box sx={{ height: 350 }}>
                    {lineData ? <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false }} /> : <Typography>No daily data</Typography>}
                </Box>
            </Paper>
        </Grid>
      </Grid>

      {/* --- Tables Section --- */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
           <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Role Breakdown</Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow><TableCell>Role</TableCell><TableCell align="right">Count</TableCell></TableRow>
                        </TableHead>
                        <TableBody>
                            {data?.roles && data.roles.length > 0 ? data.roles.map(row => (
                                <TableRow key={row.role}><TableCell>{row.role}</TableCell><TableCell align="right">{row.count}</TableCell></TableRow>
                            )) : <TableRow><TableCell colSpan={2} align="center">No role data</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Recent Participants</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Reg No</TableCell><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Email</TableCell><TableCell>Reg Type</TableCell><TableCell>Registered At</TableCell></TableRow></TableHead>
                <TableBody>
                  {!data?.recent || data.recent.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center">No recent participants found.</TableCell></TableRow>
                  ) : (
                    data.recent.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.regno}</TableCell><TableCell>{p.name}</TableCell><TableCell>{p.role}</TableCell><TableCell>{p.email}</TableCell>
                        <TableCell sx={{textTransform: 'capitalize'}}>{p.source || 'N/A'}</TableCell>
                        <TableCell>{p.registered_at ? new Date(p.registered_at).toLocaleDateString('en-IN') : '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}