import React, {useState} from 'react';
import { Box, Button, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const chartToImage = async (chartId) => {
    const canvas = await new Promise((resolve) => {
        setTimeout(() => resolve(document.getElementById(chartId)), 500);
    });
    return canvas?.toDataURL('image/png');
};

const sortRegNo = (a, b) => {
    const numA = parseInt(a.regno.split('-')[1], 10);
    const numB = parseInt(b.regno.split('-')[1], 10);
    return numA - numB;
};

export default function ReportGenerator({ user }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reportData, setReportData] = useState(null);

    const generateReport = async () => {
        setLoading(true);
setError('');
setReportData(null);

try {
    // 1. Fetch and process data (same as before)
    const [reportResult, checkinResult] = await Promise.all([
        window.electronAPI.getReportData(user.assignedEventId),
        window.electronAPI.getAllCheckInsForEvent(user.assignedEventId)
    ]);

    if (!reportResult.success) throw new Error(reportResult.message);
    if (!checkinResult.success) throw new Error(checkinResult.message);

    const data = reportResult.data;
    const allCheckIns = checkinResult.checkIns;
    const eventName = data.event.name;
    setReportData(data);
    
    const financialsByRole = data.participants.reduce((acc, p) => {
        if (!acc[p.role]) acc[p.role] = { paid: 0, unpaid: 0 };
        p.paid_status === 'Paid' ? acc[p.role].paid++ : acc[p.role].unpaid++;
        return acc;
    }, {});
    const checkedInParticipantIds = new Set(allCheckIns.map(c => c.participant_id));
    const noShowList = data.participants.filter(p => !checkedInParticipantIds.has(p.id));
    const sessionPopularity = allCheckIns.reduce((acc, c) => {
        acc[c.session_name] = (acc[c.session_name] || 0) + 1;
        return acc;
    }, {});
    const sortedSessions = Object.entries(sessionPopularity).sort((a, b) => b[1] - a[1]);
    const participantsByCountry = data.participants.reduce((acc, p) => {
        acc[p.country] = (acc[p.country] || 0) + 1;
        return acc;
    }, {});
    const participantsByRole = data.participants.reduce((acc, p) => {
        (acc[p.role] = acc[p.role] || []).push(p);
        return acc;
    }, {});

    const checkInsBySessionThenRole = allCheckIns.reduce((acc, c) => {
        const session = c.session_name;
        const role = c.participant_role;
        if (!acc[session]) acc[session] = {};
        (acc[session][role] = acc[session][role] || []).push(c);
        return acc;
    }, {});

    // 2. Initialize PDF and layout constants
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const HEADER_HEIGHT = 30;
    const FOOTER_HEIGHT = 20;
    const pageAnchors = {}; // To store the page number of each section

    // --- PAGE 1: Title Page ---
    doc.setFontSize(28).setFont(undefined, 'bold').text(eventName, pageWidth / 2, pageHeight / 2 - 10, { align: 'center' });
    const dateString = `From: ${new Date(data.event.start_date).toLocaleDateString()}  |  To: ${new Date(data.event.end_date).toLocaleDateString()}`;
    doc.setFontSize(16).setFont(undefined, 'normal').text(dateString, pageWidth / 2, pageHeight / 2 + 5, { align: 'center' });

    // --- PAGE 2: Leave blank for the Index ---
    doc.addPage();

    // --- Generate all content pages first, recording their start pages ---
    let y;

    // --- PAGE 3: Executive Summary ---
    doc.addPage();
    pageAnchors['Executive Summary'] = doc.internal.getCurrentPageInfo().pageNumber;
    y = HEADER_HEIGHT;
    doc.setFontSize(18).text('Executive Summary', 15, y); y += 5;
    autoTable(doc, { startY: y, head: [['Event Details & Organizer', '']], body: [['Description', data.event.description || 'N/A'], ['Organizer', data.event.organiser_name || 'N/A'], ['Email', data.event.organiser_email || 'N/A'], ['Phone', data.event.organiser_phone || 'N/A']], styles: { fontSize: 12 } });
    y = doc.lastAutoTable.finalY + 7;
    const stats = data.stats.stats;
    const attendanceRate = stats.total_participants > 0 ? ((stats.total_arrived / stats.total_participants) * 100).toFixed(1) : 0;
    doc.setFontSize(12).text(`Overall Attendance Rate: ${attendanceRate}% (${stats.total_arrived} of ${stats.total_participants})`, 15, y); y += 10;
    autoTable(doc, { startY: y, head: [['Session Popularity Ranking', 'Check-ins']], body: sortedSessions, headStyles: { fontSize: 12 }, styles: { fontSize: 12 } });
    

    // --- PAGE 4: Financial & Geographic Summary ---
    doc.addPage();
    pageAnchors['Financial & Geographic Summary'] = doc.internal.getCurrentPageInfo().pageNumber;
    y = HEADER_HEIGHT;
    doc.setFontSize(18).text('Financial & Geographic Summary', 15, y); y += 5;
    doc.setFontSize(18).text('', 15, y); y += 5;
    doc.setFontSize(14).text('Financial Overview by Role', 15, y); y += 5;
    const financialBody = Object.entries(financialsByRole).map(([role, counts]) => [role, counts.paid, counts.unpaid, counts.paid + counts.unpaid]);
    autoTable(doc, { startY: y, head: [['Role', 'Paid', 'Unpaid', 'Total']], body: financialBody, headStyles: { fontSize: 12 }, styles: { fontSize: 12 } });
    y = doc.lastAutoTable.finalY + 10;
    if (y > pageHeight - FOOTER_HEIGHT - 30) { doc.addPage(); y = HEADER_HEIGHT; }
    doc.setFontSize(14).text('Geographic Breakdown', 15, y); y += 5;
    autoTable(doc, { startY: y, head: [['Country', 'No. of Participants']], body: Object.entries(participantsByCountry), headStyles: { fontSize: 12 }, styles: { fontSize: 12 } });

    // --- PAGE 5: Visual Analytics ---
    doc.addPage();
    y = HEADER_HEIGHT;
    doc.setFontSize(14).text('Visual Analytics', 15, y);
    y += 10;

    // ***** FIX: Arrange all four charts in a 2x2 grid *****
    
    // 1. Capture all chart images first
    const rolesChartImg = await chartToImage('roles-chart');
    const daywiseChartImg = await chartToImage('daywise-chart');
    const financialChartImg = await chartToImage('financial-chart');
    const sourceChartImg = await chartToImage('source-chart');

    // 2. Define the grid layout parameters
    const chartWidth = 85;
    const chartHeight = 85;
    const horizontalSpacing = 10;
    const verticalSpacing = 15;
    const xLeft = 15;
    const xRight = pageWidth / 2 + 5;
    const yTop = y;
    const yBottom = yTop + chartHeight + verticalSpacing;

    // 3. Draw the charts in their grid positions
    
    // Top Row
    if (rolesChartImg) doc.addImage(rolesChartImg, 'PNG', xLeft, yTop, chartWidth, chartHeight);
    if (daywiseChartImg) doc.addImage(daywiseChartImg, 'PNG', xRight, yTop, chartWidth, chartHeight);

    // Bottom Row
    if (financialChartImg) doc.addImage(financialChartImg, 'PNG', xLeft, yBottom, chartWidth, chartHeight);
    if (sourceChartImg) doc.addImage(sourceChartImg, 'PNG', xRight, yBottom, chartWidth, chartHeight);
    // --- Participant Lists (Starts on new page) ---
    doc.addPage(); 
    pageAnchors['Participant Lists'] = doc.internal.getCurrentPageInfo().pageNumber;
    y = HEADER_HEIGHT;
    doc.setFontSize(18).text('Participant Lists by Role', 15, y); y += 10;
    const participantHead = [['Reg No', 'Name', 'Email', 'Phone', 'Company', 'Designation', 'Country','Source', 'Status']];
    for (const role of Object.keys(participantsByRole).sort()) {
        if (y > pageHeight - FOOTER_HEIGHT - 20) { doc.addPage(); y = HEADER_HEIGHT; }
        doc.setFontSize(12).text(`Role: ${role} (${participantsByRole[role].length})`, 15, y); y += 5;
        autoTable(doc, { startY: y, head: participantHead, body: participantsByRole[role].sort(sortRegNo).map(p => [p.regno, p.name, p.email, p.phone, p.company, p.designation, p.country,p.source, p.paid_status]), margin: { top: HEADER_HEIGHT }, headStyles: { fontSize: 9 }, styles: { fontSize: 8 } });
        y = doc.lastAutoTable.finalY + 10;
    }

    // --- Check-in Details (Starts on new page) ---
    if (allCheckIns.length > 0) {
        // Group check-ins by date first, then by session, then by role
        const checkInsByDate = allCheckIns.reduce((acc, c) => {
            const date = new Date(c.session_date).toLocaleDateString('en-CA'); // YYYY-MM-DD for sorting
            if (!acc[date]) acc[date] = {};
            if (!acc[date][c.session_name]) acc[date][c.session_name] = {};
            if (!acc[date][c.session_name][c.participant_role]) acc[date][c.session_name][c.participant_role] = [];
            acc[date][c.session_name][c.participant_role].push(c);
            return acc;
        }, {});

        doc.addPage();
        y = HEADER_HEIGHT;
        doc.setFontSize(14).text('Check-in Details by Session', 15, y);
        y += 10;

        let dayCounter = 1;
        // Loop through each date
        for (const date of Object.keys(checkInsByDate).sort()) {
            if (y > pageHeight - FOOTER_HEIGHT - 30) { doc.addPage(); y = HEADER_HEIGHT; }
            doc.setFontSize(13).setFont(undefined, 'bold').text(`Day ${dayCounter} (${new Date(date).toLocaleDateString()})`, 15, y);
            y += 10;

            // Loop through each session on that date
            for (const sessionName of Object.keys(checkInsByDate[date])) {
                if (y > pageHeight - FOOTER_HEIGHT - 40) { doc.addPage(); y = HEADER_HEIGHT; }
                doc.setFontSize(12).setFont(undefined, 'normal').text(`Session: ${sessionName}`, 15, y);
                y += 7;

                const sessionData = checkInsByDate[date][sessionName];
                
                // Create and draw the role-wise summary table for the session
                const summaryBody = Object.entries(sessionData).map(([role, checkins]) => [role, checkins.length]);
                autoTable(doc, {
                    startY: y,
                    head: [['Role', 'Total Check-ins']],
                    body: summaryBody,
                    theme: 'grid',
                    styles: { fontSize: 9 },
                    margin: { right: pageWidth / 2 }
                });
                y = doc.lastAutoTable.finalY + 10;
                
                // Loop through each role in that session for the detailed list
                for (const roleName of Object.keys(sessionData)) {
                    if (y > pageHeight - FOOTER_HEIGHT - 20) { doc.addPage(); y = HEADER_HEIGHT; }
                    doc.setFontSize(11).text(`Details for Role: ${roleName}`, 20, y);
                    y += 2;
                    autoTable(doc, {
                        startY: y,
                        head: [['Reg No', 'Name', 'Check-in Time']],
                        body: sessionData[roleName].map(c => [c.regno, c.participant_name, new Date(c.check_in_time).toLocaleTimeString()]),
                        margin: { top: HEADER_HEIGHT, left: 20 },
                        theme: 'striped',
                        styles: { fontSize: 9 }
                    });
                    y = doc.lastAutoTable.finalY + 10;
                }
            }
            dayCounter++;
        }
    }

    // --- No-Show List (Starts on new page) ---
    if (noShowList.length > 0) {
        doc.addPage();
        pageAnchors['No-Show Participants'] = doc.internal.getCurrentPageInfo().pageNumber;
        y = HEADER_HEIGHT;
        doc.setFontSize(18).text(`No-Show Participants (${noShowList.length})`, 15, y); y += 10;
        autoTable(doc, { startY: y, head: [['Reg No', 'Name', 'Email', 'Phone', 'Role']], body: noShowList.sort(sortRegNo).map(p => [p.regno, p.name, p.email, p.phone, p.role]), margin: { top: HEADER_HEIGHT }, headStyles: { fontSize: 12 }, styles: { fontSize: 10 } });
    }

    // --- FINAL PAGE: Notes ---
    doc.addPage();
    pageAnchors['Notes'] = doc.internal.getCurrentPageInfo().pageNumber;
    y = HEADER_HEIGHT;
    doc.setFontSize(20).text('Notes', pageWidth / 2, y, { align: 'center' });
    y += 15;
    for (let i = y; i < pageHeight - FOOTER_HEIGHT; i += 10) {
        doc.setDrawColor(200, 200, 200).line(20, i, pageWidth - 20, i);
    }

    // --- Go back and create the Index Page ---
    doc.setPage(2);
    y = HEADER_HEIGHT;
    doc.setFontSize(20).setFont(undefined, 'bold').text('Index', pageWidth / 2, y, { align: 'center' });
    y += 20;

    // ***** REVISED LOOP FOR PERFECT ALIGNMENT *****
    doc.setFontSize(14).setFont(undefined, 'normal');
    const leftMargin = 25;
    const rightMargin = pageWidth - 25;

    for (const [section, pageNum] of Object.entries(pageAnchors)) {
        const sectionText = section;
        const pageNumText = String(pageNum);

        // 1. Calculate the width of the text to determine spacing for dots
        const sectionWidth = doc.getStringUnitWidth(sectionText) * doc.getFontSize() / doc.internal.scaleFactor;
        const pageNumWidth = doc.getStringUnitWidth(pageNumText) * doc.getFontSize() / doc.internal.scaleFactor;
        
        // 2. Calculate the space available for the dots
        const availableSpace = rightMargin - leftMargin - sectionWidth - pageNumWidth;
        const dotWidth = doc.getStringUnitWidth('.') * doc.getFontSize() / doc.internal.scaleFactor;
        const numDots = Math.floor(availableSpace / dotWidth);
        const dots = '.'.repeat(numDots > 0 ? numDots - 2 : 0); // Subtract 2 for padding

        // 3. Draw the components
        doc.text(sectionText, leftMargin, y);
        doc.text(`${dots} ${pageNumText}`, rightMargin, y, { align: 'right' });

        // 4. Create an invisible link area over the page number
        const linkX = rightMargin - pageNumWidth;
        const linkHeight = doc.getFontSize();
        doc.link(linkX, y - (linkHeight / 2) + 1, pageNumWidth, linkHeight, { pageNumber: pageNum });

        y += 12; // Move to the next line
    }
    // --- FINAL STEP: Add Header and Footer to all pages ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        // Header on all pages except Title and Index
        if (i > 2) {
            doc.setFontSize(16).setTextColor(40).text('Event Report', pageWidth / 2, 15, { align: 'center' });
            doc.setFontSize(12).text(eventName, pageWidth / 2, 22, { align: 'center' });
        }
        // Footer on all pages
        doc.setFontSize(10).text(`Page ${i} of ${pageCount}`, 15, pageHeight - 10);
        doc.text(eventName, pageWidth - 15, pageHeight - 10, { align: 'right' });
    }

    // Save the PDF
    doc.save(`Event_Report_${eventName.replace(/\s/g, '_')}.pdf`);
    setReportData(null);

} catch (err) {
    setError(err.message || 'An unknown error occurred.');
} finally {
    setLoading(false);
}
    };
    
    // --- Data for hidden charts ---
    const stats = reportData?.stats?.stats;
    // ***** FIX: Increased font size for chart titles *****
    const chartTitleOptions = { font: { size: 25 } }; 
    const financialChartData = {
        labels: ['Paid', 'Unpaid'],
        datasets: [{ data: [stats?.total_paid || 0, stats?.total_unpaid || 0], backgroundColor: ['#4BC0C0', '#FF6384'] }]
    };
    const sourceChartData = {
        labels: ['Online', 'Offline'],
        datasets: [{ data: [stats?.total_online || 0, stats?.total_offline || 0], backgroundColor: ['#36A2EB', '#FFCE56'] }]
    };
    const rolesChartData = {
        labels: reportData?.stats.roles.map(r => r.role) || [],
        datasets: [{ data: reportData?.stats.roles.map(r => r.count) || [], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40','#1976D2', '#DC004E', '#FF9800', '#388E3C', '#7B1FA2', '#FFEB3B', '#FF6C03', '#17F9D3', '#F44336', '#4CAF50', '#9C27B0', '#00BCD4', '#FF5722', '#673AB7'] }],
    };
    const daywiseChartData = {
        labels: reportData?.stats.daywise.map(d => new Date(d.date).toLocaleDateString()) || [],
        datasets: [{ label: 'Registrations', data: reportData?.stats.daywise.map(d => d.count) || [], backgroundColor: 'rgba(54, 162, 235, 0.6)' }]
    };

    return (
        <Box sx={{ maxWidth: 800, m: 'auto', mt: 4 }}>
            <Paper sx={{ p: 3 }}>
                <Typography variant="h4" gutterBottom>Generate Detailed Event Report</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Generate a comprehensive, multi-page PDF report including a title page, hyperlinked index, and detailed analytics.
                </Typography>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Button variant="contained" size="large" onClick={generateReport} disabled={loading} fullWidth>
                    {loading ? <CircularProgress size={24} /> : 'Generate and Download PDF Report'}
                </Button>
            </Paper>

            {/* Hidden container for rendering charts to canvas */}
            {reportData && (
                <Box sx={{ position: 'absolute', zIndex: -1, opacity: 0 }}>
                    <Box sx={{ width: '400px', height: '400px' }}>
                        <Pie id="source-chart" data={sourceChartData} options={{ animation: false, plugins: { title: { display: true, text: 'Registrations by Source', ...chartTitleOptions } } }} />
                    </Box>
                    <Box sx={{ width: '400px', height: '400px' }}>
                        <Pie id="roles-chart" data={rolesChartData} options={{ animation: false, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Participants by Role', ...chartTitleOptions } } }} />
                    </Box>
                    <Box sx={{ width: '500px', height: '400px' }}>
                        <Bar id="daywise-chart" data={daywiseChartData} options={{ animation: false, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Daily Registrations', ...chartTitleOptions } } }} />
                    </Box>                    
                    <Box sx={{ width: '400px', height: '400px' }}>
                        <Pie id="financial-chart" data={financialChartData} options={{ animation: false, plugins: { title: { display: true, text: 'Paid vs. Unpaid Status', ...chartTitleOptions } } }} />
                    </Box>
                </Box>
            )}
        </Box>
    );
}