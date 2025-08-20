const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

/**
 * Connects to the local PostgreSQL database.
 * This function must be called from main.js on startup.
 * @param {object} config - The database connection details from config.json.
 */
async function connect(config) {
  if (pool) {
    await pool.end();
  }
  pool = new Pool({
    user: config.dbUser,
    host: config.dbHost,
    database: config.dbDatabase,
    password: config.dbPassword,
    port: config.dbPort,
  });
  // Test the connection
  await pool.query('SELECT NOW()');
  console.log('Successfully connected to the local database.');
}

/**
 * A helper function to execute queries.
 */
async function query(text, params) {
  if (!pool) {
    throw new Error('Database is not connected. Please configure the database connection.');
  }
  const res = await pool.query(text, params);
  return res;
}

// NOTE: From here, you can copy most of the functions from your server's `db.js` file,
// as the queries are the same. For example:
/* ==============================
   USER MANAGEMENT
============================== */

async function getUserByUsername(username) {
    const result = await query(`SELECT * FROM users WHERE username = $1`, [username]);
    return result.rows[0];
}

// Add these functions to your local-db.js file

async function getLocalUsers() {
    const result = await query(
        `SELECT id, username, role, assigned_event_id FROM users ORDER BY username`
    );
    return { success: true, users: result.rows };
}

async function addLocalUser(userData) {
    const { username, password, role } = userData;
    if (!username || !password || !role) {
        return { success: false, message: 'Username, password, and role are required.' };
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
        `INSERT INTO users (username, password_hash, role, needs_sync) VALUES ($1, $2, $3, TRUE) RETURNING id, username, role`,
        [username, passwordHash, role]
    );
    return { success: true, user: result.rows[0] };
}

async function updateLocalUser(userId, userData) {
    const { username, password, role } = userData;
    if (password) {
        // If a new password is provided, hash it and update it
        const passwordHash = await bcrypt.hash(password, 10);
        await query(
            `UPDATE users SET username = $1, role = $2, password_hash = $3, needs_sync = TRUE WHERE id = $4`,
            [username, role, passwordHash, userId]
        );
    } else {
        // If no password is provided, update only the username and role
        await query(
            `UPDATE users SET username = $1, role = $2, needs_sync = TRUE WHERE id = $4`,
            [username, role, userId]
        );
    }
    return { success: true };
}

async function deleteLocalUser(userId) {
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
    return { success: true };
}

// Add this new function to local-db.js
async function clearAndSeedData(data) {
    const { event, participants, sessions, templates, users } = data;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Clear existing data in the correct order to avoid foreign key issues
        await client.query('TRUNCATE TABLE check_ins, users, participants, sessions, print_templates, events RESTART IDENTITY');

        // Insert new data
        await client.query(
            `INSERT INTO events (id, name, description, start_date, end_date, organiser_name, organiser_email, organiser_phone, badge_template_id, certificate_template_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [event.id, event.name, event.description, event.start_date, event.end_date, event.organiser_name, event.organiser_email, event.organiser_phone, event.badge_template_id, event.certificate_template_id]
        );
        
        // You would continue this pattern for participants, sessions, templates, and USERS
        for (const user of users) {
             await client.query(
                `INSERT INTO users (id, username, password_hash, role, assigned_event_id) VALUES ($1, $2, $3, $4, $5)`,
                [user.id, user.username, user.password_hash, user.role, user.assigned_event_id]
            );
        }
        // ... and so on for the other tables ...

        await client.query('COMMIT');
        return { success: true, message: 'Local database seeded successfully.' };
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to seed local database:', e);
        return { success: false, message: e.message };
    } finally {
        client.release();
    }
}

// Add clearAndSeedData to your module.exports// Add this function to your local-db.js file
async function authenticateLocalUser(username, password) {
    try {
        const result = await query(`SELECT * FROM users WHERE username = $1`, [username]);
        const user = result.rows[0];

        if (!user) {
            return { success: false, message: 'Invalid username or password.' };
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return { success: false, message: 'Invalid username or password.' };
        }
        
        // Don't send the password hash to the frontend
        const { password_hash, ...userPayload } = user;
        return { success: true, user: userPayload };

    } catch (err) {
        return { success: false, message: `Database error: ${err.message}` };
    }
}


/* ==============================
   EVENT MANAGEMENT
============================== */

async function getEventById(eventId) {
    const result = await query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return result.rows[0];
}

/* ==============================
   PARTICIPANT MANAGEMENT
============================== */
async function addParticipant(data) {
    const { event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source } = data;
    const result = await query(
        `INSERT INTO participants (event_id, regno, name, email, phone, role, company, designation, country, paid_status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [event_id, regno, name, email, phone, role, company, designation, country, paidStatus, source]
    );
    return result.rows[0];
}

async function updateParticipant(id, data) {
    const { name, email, phone, role, company, designation, country, paidStatus } = data;
    const result = await query(
        `UPDATE participants SET name=$1, email=$2, phone=$3, role=$4, company=$5, designation=$6, country=$7, paid_status=$8
         WHERE id = $9 RETURNING *`,
        [name, email, phone, role, company, designation, country, paidStatus, id]
    );
    return result.rows[0];
}

async function getParticipants(eventId, filters = {}) {
    let queryStr = `SELECT * FROM participants WHERE event_id = $1`;
    const params = [eventId];
    let paramIndex = 2;

    for (const key in filters) {
        if (filters[key]) {
            queryStr += ` AND ${key} ILIKE $${paramIndex++}`;
            params.push(`%${filters[key]}%`);
        }
    }
    queryStr += ` ORDER BY id DESC`;
    const result = await query(queryStr, params);
    return result.rows;
}

async function getParticipantByRegno(eventId, regno) {
    const result = await query(
        `SELECT * FROM participants WHERE event_id = $1 AND regno = $2`,
        [eventId, regno]
    );
    return result.rows[0];
}

async function deleteParticipant(id) {
    const result = await query(`DELETE FROM participants WHERE id = $1`, [id]);
    return { changes: result.rowCount };
}

async function getNextRegNo(eventId, roleCode) {
    const prefix = `${roleCode}-`;
    const result = await query(
        `SELECT regno FROM participants
         WHERE event_id = $1 AND regno LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [eventId, `${prefix}%`]
    );
    let nextNum = 1;
    if (result.rows.length > 0) {
        const lastNum = parseInt(result.rows[0].regno.split('-')[1], 10);
        nextNum = lastNum + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

async function getParticipantsByIds(eventId, ids) {
    if (!ids || ids.length === 0) return [];
    const result = await query(
        `SELECT * FROM participants WHERE event_id = $1 AND id = ANY($2::int[])`,
        [eventId, ids]
    );
    return result.rows;
}

/* ==============================
   CHECK-INS & SESSIONS
============================== */

/**
 * --- UPDATED: This function now respects the `max_checkins` limit ---
 * Adds a check-in record for a participant.
 */
async function addCheckIn(eventId, participantId, sessionId) {
    // Get the session's check-in limit
    const sessionRes = await query(`SELECT max_checkins FROM sessions WHERE id = $1`, [sessionId]);
    const maxCheckins = sessionRes.rows[0]?.max_checkins || 1;

    // Count existing check-ins for this participant and session
    const countRes = await query(
      `SELECT COUNT(*) FROM check_ins WHERE participant_id = $1 AND session_id = $2`,
      [participantId, sessionId]
    );
    const existingCheckinCount = parseInt(countRes.rows[0].count, 10);

    // If the count has reached the max limit, return a "limit reached" status
    if (existingCheckinCount >= maxCheckins) {
      return { limit_reached: true, count: existingCheckinCount, limit: maxCheckins };
    }

    // Otherwise, insert a new check-in record
    const result = await query(
        `INSERT INTO check_ins (event_id, participant_id, session_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [eventId, participantId, sessionId]
    );
    return result.rows[0];
}

async function getCheckInsBySession(eventId, sessionId) {
    const result = await query(
        `SELECT c.check_in_time, p.regno, p.name
         FROM check_ins c
         JOIN participants p ON c.participant_id = p.id
         WHERE c.event_id = $1 AND c.session_id = $2
         ORDER BY c.check_in_time DESC`,
        [eventId, sessionId]
    );
    return result.rows;
}

/**
 * --- UPDATED: Now includes the `maxCheckins` parameter ---
 * Adds a new session for an event.
 */
async function addSession(eventId, sessionDate, name, maxCheckins = 1) {
    const result = await query(
        `INSERT INTO sessions (event_id, session_date, name, max_checkins)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [eventId, sessionDate, name, maxCheckins]
    );
    return result.rows[0];
}

/**
 * --- UPDATED: Now includes the `maxCheckins` parameter ---
 * Updates an existing session.
 */
async function updateSession(sessionId, name, sessionDate, maxCheckins) {
    const result = await query(
        `UPDATE sessions SET name = $1, session_date = $2, max_checkins = $3 WHERE id = $4 RETURNING *`,
        [name, sessionDate, maxCheckins, sessionId]
    );
    return result.rows[0];
}

async function deleteSession(sessionId) {
    const result = await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    return { changes: result.rowCount };
}

async function getSessionsByEvent(eventId) {
    const result = await query(
        `SELECT * FROM sessions WHERE event_id = $1 ORDER BY session_date, name`,
        [eventId]
    );
    return result.rows;
}

/* ==============================
   DASHBOARD QUERIES
============================== */
async function getDashboardStats(eventId) {
    const statsQuery = `
        SELECT
            (SELECT COUNT(*) FROM participants WHERE event_id = $1) AS total_participants,
            (SELECT COUNT(DISTINCT participant_id) FROM check_ins WHERE event_id = $1) AS total_arrived,
            (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND source = 'online') AS total_online,
            (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND source = 'offline') AS total_offline,
            (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND paid_status = 'Paid') AS total_paid,
            (SELECT COUNT(*) FROM participants WHERE event_id = $1 AND paid_status = 'Unpaid') AS total_unpaid
    `;
    const rolesQuery = `SELECT role, COUNT(*) AS count FROM participants WHERE event_id = $1 AND role IS NOT NULL GROUP BY role`;
    const daywiseQuery = `SELECT DATE(registered_at) AS date, COUNT(*) AS count FROM participants WHERE event_id = $1 GROUP BY DATE(registered_at) ORDER BY date ASC`;
    const recentQuery = `SELECT * FROM participants WHERE event_id = $1 ORDER BY id DESC LIMIT 5`;

    const [statsResult, rolesResult, daywiseResult, recentResult] = await Promise.all([
        query(statsQuery, [eventId]),
        query(rolesQuery, [eventId]),
        query(daywiseQuery, [eventId]),
        query(recentQuery, [eventId]),
    ]);

    return {
        stats: statsResult.rows[0],
        roles: rolesResult.rows,
        daywise: daywiseResult.rows,
        recent: recentResult.rows,
    };
}

/* ==============================
   PRINT TEMPLATE MANAGEMENT
============================== */

async function getPrintTemplatesByEvent(eventId) {
    const result = await query(
        `SELECT * FROM print_templates WHERE event_id = $1 ORDER BY template_name`,
        [eventId]
    );
    return result.rows;
}

async function getPrintTemplateById(templateId) {
    const result = await query(
        `SELECT * FROM print_templates WHERE id = $1`,
        [templateId]
    );
    if (result.rows[0] && typeof result.rows[0].template_data === 'string') {
        result.rows[0].template_data = JSON.parse(result.rows[0].template_data);
    }
    return result.rows[0];
}

async function updatePrintTemplate(templateId, templateName, templateData) {
    const result = await query(
        `UPDATE print_templates SET template_name = $1, template_data = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
        [templateName, templateData, templateId]
    );
    return result.rows[0];
}

async function deletePrintTemplate(templateId) {
    const result = await query(`DELETE FROM print_templates WHERE id = $1`, [templateId]);
    return { changes: result.rowCount };
}

// Add this function
async function ping() {
    try {
        await query('SELECT 1');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
// UPDATE module.exports TO INCLUDE THE NEW FUNCTIONS
// Export only the functions needed for the local kiosk/hub
module.exports = {
  // Core
  connect,
  query,

  // Local User Auth
  getUserByUsername,
  clearAndSeedData,

  // Event Details
  getEventById,

  // Participant Management
  addParticipant,
  updateParticipant,
  getParticipants,
  getParticipantByRegno,
  getParticipantsByIds,
  deleteParticipant,
  getNextRegNo,

  // Check-in & Session Management
  addCheckIn,
  getCheckInsBySession,
  addSession,
  updateSession,
  deleteSession,
  getSessionsByEvent,

  // Dashboard
  getDashboardStats,
  
  // Print Template Management
  getPrintTemplatesByEvent,
  updatePrintTemplate,
  deletePrintTemplate,
  getPrintTemplateById,
  getLocalUsers,
  addLocalUser,
  updateLocalUser,
  deleteLocalUser,
  ping,
  authenticateLocalUser
};
