// Load environment variables from .env file at the very start
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('./db');

const app = express();
// Use the PORT from the .env file, or default to 3001
const PORT = process.env.PORT || 3001;
// Use the AUTH_SECRET from the .env file
const AUTH_SECRET = process.env.AUTH_SECRET;

// =================================================================
// MIDDLEWARE
// =================================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, AUTH_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }
    next();
};

const getEventIdForRequest = (req) => {
    if (req.originalUrl.startsWith('/api/print-templates')) {
        // global templates don't need eventId
        return null;
    }

    if (req.user.role === 'admin') {
        const eventId = req.params.eventId || req.query.eventId || req.body.eventId || req.params.id;
        if (!eventId && !req.path.startsWith('/api/events') && !req.path.startsWith('/api/users')) {
            throw new Error('Admin must specify an eventId for this operation.');
        }
        return eventId ? parseInt(eventId, 10) : null;
    }

    if (!req.user.assignedEventId) {
        throw new Error('Kiosk user has no assigned event.');
    }

    return req.user.assignedEventId;
};



// =================================================================
// AUTH ROUTES
// =================================================================
app.post('/api/auth/login',
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const { username, password } = req.body;
            const user = await db.getUserByUsername(username);
            if (!user || !(await bcrypt.compare(password, user.password_hash))) {
                return res.status(401).json({ success: false, message: 'Invalid username or password' });
            }
            const payload = {
                userId: user.id,
                username: user.username,
                role: user.role,
                assignedEventId: user.assigned_event_id
            };
            const token = jwt.sign(payload, AUTH_SECRET, { expiresIn: '8h' });
            res.json({ success: true, token, user: payload });
        } catch (err) {
            next(err);
        }
    }
);

// --- RETURN CURRENT LOGGED IN USER ---
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});


// =================================================================
// DASHBOARD ROUTE
// =================================================================
app.get('/api/dashboard', authMiddleware, async (req, res, next) => {
    try {
        const eventId = getEventIdForRequest(req);
        const dashboardData = await db.getDashboardStats(eventId);
        res.json({ success: true, ...dashboardData });
    } catch (err) {
        next(err);
    }
});
// =================================================================
// HEALTH / STATUS ROUTE (for kiosk connection test)
// =================================================================

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        message: 'Central server is running',
        timestamp: new Date().toISOString()
    });
});
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Central server running' });
});

// =================================================================
// EVENT ROUTES
// =================================================================
app.get('/api/events', authMiddleware, async (req, res, next) => {
    try {
        if (req.user.role === 'admin') {
            const events = await db.getAllEventsWithStats();
            return res.json({ success: true, events });
        }
        if (req.user.assignedEventId) {
            const event = await db.getEventById(req.user.assignedEventId);
            return res.json({ success: true, events: [event] });
        }
        return res.status(403).json({ success: false, message: 'No events assigned' });
    } catch (err) {
        next(err);
    }
});


app.post('/api/events',
    authMiddleware,
    adminOnly,
    body('name').isString().notEmpty().withMessage('Event name is required.'),
    body('start_date').isISO8601().toDate().withMessage('A valid start date is required.'),
    body('end_date').isISO8601().toDate().withMessage('A valid end date is required.'),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const { name, description, start_date, end_date, organiser_name, organiser_email, organiser_phone } = req.body;
            const event = await db.addEvent(name, description, start_date, end_date, organiser_name, organiser_email, organiser_phone);
            res.status(201).json({ success: true, event });
        } catch (err) {
            next(err);
        }
    }
);

app.get('/api/events/:id', authMiddleware, async (req, res, next) => {
    try {
        const requestedEventId = parseInt(req.params.id, 10);
        if (req.user.role !== 'admin' && req.user.assignedEventId !== requestedEventId) {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not have access to this event.' });
        }
        const event = await db.getEventById(requestedEventId);
        if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
        const sessions = await db.getSessionsByEvent(requestedEventId);
        res.json({ success: true, details: { ...event, sessions } });
    } catch (err) {
        next(err);
    }
});

app.put('/api/events/:id', authMiddleware, adminOnly, async (req, res, next) => {
    try {
        const updated = await db.updateEvent(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, message: 'Event not found' });
        res.json({ success: true, event: updated });
    } catch (err) {
        next(err);
    }
});

app.delete('/api/events/:id', authMiddleware, adminOnly, async (req, res, next) => {
    try {
        const result = await db.deleteEvent(req.params.id);
        if (result.changes === 0) return res.status(404).json({ success: false, message: 'Event not found' });
        res.json({ success: true, message: 'Event and all associated data deleted' });
    } catch (err) {
        next(err);
    }
});

app.delete('/api/events/:id/sessions', authMiddleware, adminOnly, async (req, res, next) => {
    try {
        await db.deleteAllSessionsForEvent(req.params.id);
        res.json({ success: true, message: 'All sessions for the event have been deleted.' });
    } catch (err) {
        next(err);
    }
});

/* =====================
   USER ROUTES
===================== */
app.get('/api/users', authMiddleware, adminOnly, async (req, res, next) => {
    try {
        const users = await db.getAllUsers();
        res.json({ success: true, users });
    } catch (err) {
        next(err);
    }
});

/* =====================
   PARTICIPANT ROUTES
===================== */
app.get('/api/nextRegNo/:roleCode', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const { roleCode } = req.params;
        const regno = await db.getNextRegNo(eventId, roleCode);
        res.json({ success: true, regno });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/participants', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const { regno, name, email, phone, role } = req.query;
        const filters = { regno, name, email, phone, role };
        const participants = await db.getParticipants(eventId, filters);
        res.json({ success: true, participants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const roleCodeMap = { 'Delegate': 'DEL', 'Faculty': 'FAC', 'Organizer': 'ORG', 'Crew': 'CRW', 'VIP': 'VIP' };
app.post('/api/participants/bulk', authMiddleware, async (req, res) => {
    const eventId = getEventIdForRequest(req);
    const { participants } = req.body;
    if (!Array.isArray(participants)) {
        return res.status(400).json({ success: false, message: 'Request body must be an array of participants.' });
    }
    const results = { inserted: [], skipped: [], errors: [] };
    for (const p of participants) {
        try {
            const roleCode = roleCodeMap[p.role];
            if (!p.role || !p.name || !roleCode) {
                throw new Error('Missing required fields (role, name) or invalid role.');
            }
            const regno = await db.getNextRegNo(eventId, roleCode);
            const participantData = { event_id: eventId, regno, name: p.name, email: p.email || null, phone: p.phone || null, role: p.role, company: p.company || null, designation: p.designation || null, country: p.country || null, paidStatus: p.paidStatus || 'N/A', source: 'online' };
            const newParticipant = await db.addParticipant(participantData);
            results.inserted.push(newParticipant);
        } catch (err) {
            if (err.code === '23505') { 
                results.skipped.push({ participant: p, reason: 'Duplicate entry (email/phone).' });
            } else {
                results.errors.push({ participant: p, error: err.message });
            }
        }
    }
    res.status(200).json({ success: true, result: results });
});

app.post('/api/participants', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const participantData = { ...req.body, event_id: eventId, source: 'offline' };
        const participant = await db.addParticipant(participantData);
        res.status(201).json({ success: true, participant });
    } catch (err) {
        res.status(400).json({ success: false, message: err.code === '23505' ? 'A participant with this email or phone number already exists for this event.' : err.message });
    }
});

app.put('/api/participants/:id', authMiddleware, async (req, res) => {
    try {
        const participant = await db.updateParticipant(req.params.id, req.body);
        if (!participant) return res.status(404).json({ success: false, message: 'Participant not found' });
        res.json({ success: true, participant });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/participants/:id', authMiddleware, async (req, res) => {
    try {
        const result = await db.deleteParticipant(req.params.id);
        if (result.changes === 0) return res.status(404).json({ success: false, message: 'Participant not found' });
        res.json({ success: true, message: 'Participant deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/participants/byIds', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const idsParam = req.query.ids;
        if (!idsParam) return res.status(400).json({ success: false, message: 'Missing ids query parameter.' });
        const ids = idsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        if (!ids.length) return res.status(400).json({ success: false, message: 'No valid IDs provided.' });
        const participants = await db.getParticipantsByIds(eventId, ids);
        res.json({ success: true, participants });
    } catch (err) {
        console.error("Error fetching participants by IDs:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* =====================
   SESSION ROUTES
===================== */

/**
 * --- UPDATED: Now accepts `max_checkins` in the request body ---
 */
app.post('/api/sessions', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { eventId, session_date, name, max_checkins } = req.body;
        const newSession = await db.addSession(eventId, session_date, name, max_checkins);
        res.status(201).json({ success: true, session: newSession });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

/**
 * --- UPDATED: Now accepts `max_checkins` in the request body ---
 */
app.put('/api/sessions/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { name, session_date, max_checkins } = req.body;
        const updatedSession = await db.updateSession(req.params.id, name, session_date, max_checkins);
        res.json({ success: true, session: updatedSession });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.delete('/api/sessions/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        await db.deleteSession(req.params.id);
        res.json({ success: true, message: 'Session deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/sessions/bulk', authMiddleware, adminOnly, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const { sessions } = req.body;
        if (!Array.isArray(sessions)) return res.status(400).json({ success: false, message: 'Request body must be an array of sessions.' });
        const results = { inserted: [], errors: [] };
        for (const s of sessions) {
            try {
                if (!s.name || !s.date) throw new Error("Missing name or date");
                const newSession = await db.addSession(eventId, s.date, s.name);
                results.inserted.push(newSession);
            } catch(err) {
                results.errors.push({ session: s, error: err.message });
            }
        }
        res.json({ success: true, result: results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/sessions', authMiddleware, async(req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const sessions = await db.getSessionsByEvent(eventId);
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* =====================
   CHECK-IN ROUTES
===================== */
app.post('/api/checkin', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const { regno, sessionId } = req.body;
        const participant = await db.getParticipantByRegno(eventId, regno);
        if (!participant) {
            return res.status(404).json({ success: false, message: 'Participant not found for this event.' });
        }
        const checkInResult = await db.addCheckIn(eventId, participant.id, sessionId);
        
        // --- UPDATED: Handle the new "limit_reached" status ---
        if (checkInResult.limit_reached) {
            return res.status(200).json({ 
                success: true, 
                message: `Check-in limit of ${checkInResult.limit} reached.`,
                participant 
            });
        }
        
        res.json({ success: true, checkIn: checkInResult, participant });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.get('/api/checkins/:sessionId', authMiddleware, async (req, res) => {
    try {
        const eventId = getEventIdForRequest(req);
        const checkIns = await db.getCheckInsBySession(eventId, req.params.sessionId);
        res.json({ success: true, checkIns });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* =================================
   PRINT TEMPLATE ROUTES
================================= */
// Get all templates
app.get('/api/print-templates', authMiddleware, async (req, res) => {
  try {
    const templates = await db.getAllPrintTemplates();
    res.json({ success: true, templates });
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ success: false, message: 'Error fetching templates' });
  }
});


// Create new template
app.post('/api/print-templates', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { templateName, templateData } = req.body;
        if (!templateName || !templateData) {
            return res.status(400).json({ success: false, message: 'templateName and templateData are required.' });
        }
        const newTemplate = await db.addPrintTemplate(templateName, templateData);
        res.status(201).json({ success: true, template: newTemplate });
    } catch (err) {
        console.error("Error creating print template:", err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// Update template
app.put('/api/print-templates/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { templateName, templateData } = req.body;
        if (!templateName || !templateData) {
            return res.status(400).json({ success: false, message: 'templateName and templateData are required.' });
        }
        const updatedTemplate = await db.updatePrintTemplate(req.params.id, templateName, templateData);
        if (!updatedTemplate) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        res.json({ success: true, template: updatedTemplate });
    } catch (err) {
        console.error("Error updating print template:", err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// Get one template
app.get('/api/print-templates/:id', authMiddleware, async (req, res) => {
    try {
        const template = await db.getPrintTemplateById(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        res.json({ success: true, template });
    } catch (err) {
        console.error("Error fetching single print template:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete template
app.delete('/api/print-templates/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
        const result = await db.deletePrintTemplate(req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        res.json({ success: true, message: 'Template deleted successfully' });
    } catch (err) {
        console.error("Error deleting print template:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- Kiosk Discovery & Push Endpoints (NEW) ---

/**
 * Simulates network discovery of Kiosk Apps.
 * In a real-world scenario, this would use UDP broadcasts or mDNS to find devices.
 */
app.get('/api/kiosks/discover', (req, res) => {
    // This is a placeholder. A real implementation is highly complex.
    const mockKiosks = [
        { id: 'kiosk-1', name: 'Front Desk PC', ip: '192.168.1.101' },
        { id: 'kiosk-2', name: 'Check-in Station 2', ip: '192.168.1.102' },
    ];
    res.json({ success: true, kiosks: mockKiosks });
});

/**
 * Pushes a complete event data package to a specific kiosk.
 */
app.post('/api/kiosks/assign-event', authMiddleware, adminOnly, async (req, res) => {
    const { kioskIp, eventId } = req.body;
    if (!kioskIp || !eventId) {
        return res.status(400).json({ success: false, message: 'Kiosk IP and Event ID are required.' });
    }
    
    try {
        // 1. Get all data for the event, similar to the /seed endpoint
        const eventData = await db.getFullEventData(eventId);
        if (!eventData.event) {
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }

        // 2. Forward this data to the kiosk's listener endpoint
        const kioskUrl = `http://${kioskIp}:4001/assign-event`; // Kiosks will listen on port 4001
        const pushResponse = await fetch(kioskUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
        });

        if (!pushResponse.ok) {
            throw new Error(`Kiosk at ${kioskIp} responded with status ${pushResponse.status}`);
        }
        
        const result = await pushResponse.json();
        if (!result.success) {
            throw new Error(`Kiosk reported an error: ${result.message}`);
        }

        res.json({ success: true, message: `Successfully assigned event to kiosk at ${kioskIp}` });

    } catch (err) {
        console.error('Push to Kiosk Error:', err);
        res.status(500).json({ success: false, message: `Failed to push event: ${err.message}` });
    }
});


/* =================================================================
   KIOSK SYNC ROUTES (NEW)
================================================================= */

/**
 * SEED Route: Provides all necessary data for a specific event to a kiosk.
 * A kiosk calls this endpoint once during initial setup.
 */
app.get('/api/events/:id/seed', authMiddleware, async (req, res, next) => {
    try {
        const eventId = parseInt(req.params.id, 10);

        // Security check: Ensure the user has access to this event
        if (req.user.role !== 'admin' && req.user.assignedEventId !== eventId) {
            return res.status(403).json({ success: false, message: 'Forbidden: You are not assigned to this event.' });
        }

        const seedData = await db.getFullEventData(eventId);

        if (!seedData || !seedData.event) {
            return res.status(404).json({ success: false, message: 'Event not found or no data available to seed.' });
        }

        res.json({ success: true, data: seedData });

    } catch (err) {
        next(err);
    }
});


/**
 * SYNC UPLOAD Route: Receives a batch of offline data from a kiosk.
 * A kiosk calls this to push its local changes to the central server.
 */
app.post('/api/sync/upload', authMiddleware, async (req, res, next) => {
    try {
        // Use the existing helper function to determine the event ID based on the user's role and assignment
        const eventId = getEventIdForRequest(req);
        if (!eventId) {
            return res.status(400).json({ success: false, message: 'Event ID is required for sync.' });
        }

        const { participants, checkIns, sessions, templates } = req.body;

        // Use Promise.all to run sync operations concurrently for better performance.
        // The `|| []` ensures that if a key is missing from the payload, it doesn't crash.
        await Promise.all([
            db.bulkUpsertParticipants(participants || []),
            db.bulkUpsertCheckIns(checkIns || []),
            db.bulkUpsertSessions(sessions || []),
            db.bulkUpsertPrintTemplates(templates || [])
        ]);

        // After all data is successfully upserted, update the event's sync timestamp
        await db.updateEventSyncTimestamp(eventId);

        res.json({ success: true, message: 'Sync completed successfully.' });

    } catch (err) {
        // Pass any database or other errors to the central error handler
        next(err);
    }
});


app.listen(PORT, () => {
    console.log(`✅ Event API server running on http://localhost:${PORT}`);
});