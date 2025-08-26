const pg = require('pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pg.types.setTypeParser(1082, val => val);

async function query(text, params) {
    const res = await pool.query(text, params);
    return res;
}

/* ==============================
   USER MANAGEMENT
============================== */
async function createUser(username, password, role) {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
        `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role`,
        [username, passwordHash, role]
    );
    return result.rows[0];
}

async function getUserByUsername(username) {
    const result = await query(`SELECT * FROM users WHERE username = $1`, [username]);
    return result.rows[0];
}

async function getAllUsers() {
    const result = await query(
        `SELECT u.id, u.username, u.role, u.assigned_event_id, e.name AS assigned_event_name
         FROM users u
         LEFT JOIN events e ON u.assigned_event_id = e.id
         ORDER BY u.id`
    );
    return result.rows;
}

async function deleteUser(userId) {
    const result = await query(`DELETE FROM users WHERE id = $1`, [userId]);
    return { changes: result.rowCount };
}

async function assignEventToUser(userId, eventId) {
    const result = await query(
        `UPDATE users SET assigned_event_id = $1 WHERE id = $2 RETURNING *`,
        [eventId, userId]
    );
    return result.rows[0];
}

/* ==============================
   EVENT MANAGEMENT
============================== */
async function addEvent(name, description, startDate, endDate, orgName, orgEmail, orgPhone) {
    const result = await query(
        `INSERT INTO events (name, description, start_date, end_date, organiser_name, organiser_email, organiser_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, description, startDate, endDate, orgName, orgEmail, orgPhone]
    );
    return result.rows[0];
}

async function updateEvent(id, data) {
    const {
        name, description, start_date, end_date, organiser_name, organiser_email, 
        organiser_phone, roles, print_settings, local_admin_ids, is_ticketing_enabled,
        website, state, country // New fields
    } = data;

    const rolesJson = JSON.stringify(roles);
    const printSettingsJson = JSON.stringify(print_settings);

    const result = await query(
        `UPDATE events
         SET name = $1, description = $2, start_date = $3, end_date = $4,
             organiser_name = $5, organiser_email = $6, organiser_phone = $7,
             roles = $8, print_settings = $9, local_admin_ids = $10,
             is_ticketing_enabled = $11, website = $12, state = $13, country = $14
         WHERE id = $15 RETURNING *`,
        [
            name, description, start_date, end_date, organiser_name, organiser_email, 
            organiser_phone, rolesJson, printSettingsJson, local_admin_ids,
            is_ticketing_enabled, website, state, country, id
        ]
    );
    return result.rows[0];
}

async function deleteAllSessionsForEvent(eventId) {
    // The ON DELETE CASCADE in the schema will handle related check_ins
    const result = await query(`DELETE FROM sessions WHERE event_id = $1`, [eventId]);
    return { changes: result.rowCount };
}

async function deleteEvent(eventId) {
    await query(`UPDATE users SET assigned_event_id = NULL WHERE assigned_event_id = $1`, [eventId]);
    const result = await query(`DELETE FROM events WHERE id = $1`, [eventId]);
    return { changes: result.rowCount };
}

async function getAllEventsWithStats() {
    const result = await query(`
        SELECT e.*,
               COUNT(p.id) AS total_participants,
               COUNT(CASE WHEN p.source = 'offline' THEN 1 END) AS offline_participants,
               COUNT(CASE WHEN p.source != 'offline' THEN 1 END) AS online_participants
        FROM events e
        LEFT JOIN participants p ON e.id = p.event_id
        GROUP BY e.id
        ORDER BY e.start_date DESC
    `);
    return result.rows;
}

async function getEventById(eventId) {
    const result = await query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return result.rows[0];
}

/* ==============================
   VENUE MANAGEMENT (NEW)
============================== */
async function getVenuesForEvent(eventId) {
    const result = await query(`SELECT * FROM venues WHERE event_id = $1 ORDER BY date`, [eventId]);
    return result.rows;
}

async function addVenue(data) {
    const { event_id, name, address, date } = data;
    const result = await query(
        `INSERT INTO venues (event_id, name, address, date) VALUES ($1, $2, $3, $4) RETURNING *`,
        [event_id, name, address, date]
    );
    return result.rows[0];
}

async function updateVenue(venueId, data) {
    const { name, address, date } = data;
    const result = await query(
        `UPDATE venues SET name = $1, address = $2, date = $3 WHERE id = $4 RETURNING *`,
        [name, address, date, venueId]
    );
    return result.rows[0];
}

async function deleteVenue(venueId) {
    const result = await query(`DELETE FROM venues WHERE id = $1`, [venueId]);
    return { changes: result.rowCount };
}

/* ==============================
   HALL MANAGEMENT (NEW)
============================== */
async function getHallsForEvent(eventId) {
    const result = await query(`SELECT * FROM halls WHERE event_id = $1 ORDER BY name`, [eventId]);
    return result.rows;
}

async function addHall(data) {
    const { event_id, name, capacity } = data;
    const result = await query(
        `INSERT INTO halls (event_id, name, capacity) VALUES ($1, $2, $3) RETURNING *`,
        [event_id, name, capacity]
    );
    return result.rows[0];
}

async function updateHall(hallId, data) {
    const { name, capacity } = data;
    const result = await query(
        `UPDATE halls SET name = $1, capacity = $2 WHERE id = $3 RETURNING *`,
        [name, capacity, hallId]
    );
    return result.rows[0];
}

async function deleteHall(hallId) {
    const result = await query(`DELETE FROM halls WHERE id = $1`, [hallId]);
    return { changes: result.rowCount };
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
 * Adds a check-in record for a participant.
 */
async function addCheckIn(eventId, participantId, sessionId) {
    // Get session info
    const sessionRes = await query(
      `SELECT max_checkins, allowed_roles FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) throw new Error("Session not found");

    const { max_checkins, allowed_roles } = sessionRes.rows[0];
    const maxCheckins = max_checkins || 1;

    // Get participant role
    const pRes = await query(`SELECT role FROM participants WHERE id = $1`, [participantId]);
    if (pRes.rows.length === 0) throw new Error("Participant not found");
    const participantRole = pRes.rows[0].role;

    // Role check
    if (allowed_roles && allowed_roles !== "All") {
      const rolesAllowed = allowed_roles.split(",").map(r => r.trim());
      if (!rolesAllowed.includes(participantRole)) {
        return { not_allowed: true, reason: "Role not permitted" };
      }
    }

    // Count existing check-ins for this participant and session
    const countRes = await query(
      `SELECT COUNT(*) FROM check_ins WHERE participant_id = $1 AND session_id = $2`,
      [participantId, sessionId]
    );
    const existingCheckinCount = parseInt(countRes.rows[0].count, 10);

    if (existingCheckinCount >= maxCheckins) {
      return { limit_reached: true, count: existingCheckinCount, limit: maxCheckins };
    }

    // Insert check-in
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
async function addSession(eventId, sessionDate, name, maxCheckins, hall_id, allowed_roles) {
    const result = await query(
        `INSERT INTO sessions (event_id, session_date, name, max_checkins, hall_id, allowed_roles)
         VALUES ($1, $2, $3, $4, $5, $6::text[]) RETURNING *`,
        [
          eventId,
          sessionDate,
          name,
          maxCheckins,
          hall_id || null,
          allowed_roles && Array.isArray(allowed_roles) ? allowed_roles : ['All']
        ]
    );
    return result.rows[0];
}


/**
 * Updates an existing session.
 */
async function updateSession(sessionId, name, sessionDate, maxCheckins, hall_id, allowed_roles) {
    const result = await query(
        `UPDATE sessions SET name = $1, session_date = $2, max_checkins = $3, hall_id = $4, allowed_roles = $5 
         WHERE id = $6 RETURNING *`,
        [name, sessionDate, maxCheckins, hall_id || null, allowed_roles || null, sessionId]
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
      COUNT(*) AS total_participants,
      COUNT(DISTINCT c.participant_id) AS total_arrived,
      COUNT(*) FILTER (WHERE p.source = 'online') AS total_online,
      COUNT(*) FILTER (WHERE p.source = 'offline') AS total_offline,
      COUNT(*) FILTER (WHERE p.paid_status = 'Paid') AS total_paid,
      COUNT(*) FILTER (WHERE p.paid_status = 'Unpaid') AS total_unpaid
    FROM participants p
    LEFT JOIN check_ins c ON p.id = c.participant_id
    WHERE p.event_id = $1
  `;

  const rolesQuery = `
    SELECT role, COUNT(*) AS count
    FROM participants
    WHERE event_id = $1 AND role IS NOT NULL
    GROUP BY role
  `;

  const daywiseQuery = `
    SELECT DATE(registered_at) AS date, COUNT(*) AS count
    FROM participants
    WHERE event_id = $1
    GROUP BY DATE(registered_at)
    ORDER BY date ASC
  `;

  const recentQuery = `
    SELECT *
    FROM participants
    WHERE event_id = $1
    ORDER BY id DESC
    LIMIT 5
  `;

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


// =====================
// PRINT TEMPLATE QUERIES (Global)
// =====================
async function getAllPrintTemplates() {
    const result = await query(`SELECT * FROM print_templates ORDER BY id`);
    return result.rows.map(r => ({
        id: r.id,
        templateName: r.template_name,
        templateData: r.template_data // JSONB comes out as JS object automatically
    }));
}

async function getPrintTemplateById(id) {
    const result = await query(`SELECT * FROM print_templates WHERE id = $1`, [id]);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
        id: r.id,
        templateName: r.template_name,
        templateData: r.template_data
    };
}

async function addPrintTemplate(templateName, templateData) {
    const result = await query(
        `INSERT INTO print_templates (template_name, template_data)
         VALUES ($1, $2) RETURNING *`,
        [templateName, templateData]   // ← templateData can go directly if JSONB column
    );
    return {
        id: result.rows[0].id,
        templateName: result.rows[0].template_name,
        templateData: result.rows[0].template_data
    };
}

async function updatePrintTemplate(id, templateName, templateData) {
    const result = await query(
        `UPDATE print_templates
         SET template_name = $1, template_data = $2
         WHERE id = $3 RETURNING *`,
        [templateName, templateData, id]
    );
    if (result.rows.length === 0) return null;
    return {
        id: result.rows[0].id,
        templateName: result.rows[0].template_name,
        templateData: result.rows[0].template_data
    };
}

async function deletePrintTemplate(id) {
    const result = await query(`DELETE FROM print_templates WHERE id = $1`, [id]);
    return { changes: result.rowCount };
}

/* ==============================
   SYNCHRONIZATION FUNCTIONS (NEW)
============================== */

/**
 * Fetches all relevant data for a single event to "seed" a local kiosk database.
 * @param {number} eventId The ID of the event to fetch data for.
 */
async function getFullEventData(eventId) {
    const [event, participants, sessions, templates, users] = await Promise.all([
        query(`SELECT * FROM events WHERE id = $1`, [eventId]),
        query(`SELECT * FROM participants WHERE event_id = $1`, [eventId]),
        query(`SELECT * FROM sessions WHERE event_id = $1`, [eventId]),
        // CORRECTED: Templates are global and should not be filtered by event_id
        query(`SELECT * FROM print_templates`, []),
        query(`SELECT id, username, role, password_hash, assigned_event_id FROM users WHERE role != 'admin'`, [])
    ]);

    return {
        event: event.rows[0],
        participants: participants.rows,
        sessions: sessions.rows,
        templates: templates.rows,
        users: users.rows
    };
}


/**
 * Fetches all records for an event that have been updated since a given timestamp.
 * @param {number} eventId The ID of the event.
 * @param {string} lastSyncTime An ISO 8601 timestamp string.
 */
async function getUpdatesSince(eventId, lastSyncTime) {
    const [participants, sessions, checkIns, templates] = await Promise.all([
        query(`SELECT * FROM participants WHERE event_id = $1 AND updated_at > $2`, [eventId, lastSyncTime]),
        query(`SELECT * FROM sessions WHERE event_id = $1 AND updated_at > $2`, [eventId, lastSyncTime]),
        query(`SELECT * FROM check_ins WHERE event_id = $1 AND updated_at > $2`, [eventId, lastSyncTime]),
        query(`SELECT * FROM print_templates WHERE event_id = $1 AND updated_at > $2`, [eventId, lastSyncTime]),
    ]);

    return {
        participants: participants.rows,
        sessions: sessions.rows,
        checkIns: checkIns.rows,
        templates: templates.rows
    };
}

/**
 * Performs a bulk "upsert" (update or insert) for participants.
 * This is a simplified example. A more robust version would handle conflicts on unique keys like email or regno.
 * @param {Array} participants An array of participant objects from a kiosk.
 */
async function bulkUpsertParticipants(participants) {
    // This uses PostgreSQL's ON CONFLICT feature to either INSERT a new record
    // or UPDATE an existing one based on the primary key `id`.
    const upsertQuery = `
        INSERT INTO participants (id, event_id, regno, name, email, phone, role, company, designation, country, paid_status, source, registered_at, updated_at, needs_sync)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE)
        ON CONFLICT (id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            regno = EXCLUDED.regno,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            company = EXCLUDED.company,
            designation = EXCLUDED.designation,
            country = EXCLUDED.country,
            paid_status = EXCLUDED.paid_status,
            source = EXCLUDED.source,
            updated_at = EXCLUDED.updated_at,
            needs_sync = FALSE;
    `;
    
    // We run each upsert in a transaction to ensure all or none succeed.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of participants) {
            const values = [p.id, p.event_id, p.regno, p.name, p.email, p.phone, p.role, p.company, p.designation, p.country, p.paid_status, p.source, p.registered_at, p.updated_at];
            await client.query(upsertQuery, values);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
/**
 * Performs a bulk "upsert" for check-ins.
 * @param {Array} checkIns An array of check-in objects from a kiosk.
 */
async function bulkUpsertCheckIns(checkIns) {
    if (!checkIns || checkIns.length === 0) return;
    const upsertQuery = `
        INSERT INTO check_ins (id, event_id, participant_id, session_id, check_in_time, updated_at, needs_sync)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE)
        ON CONFLICT (id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            participant_id = EXCLUDED.participant_id,
            session_id = EXCLUDED.session_id,
            check_in_time = EXCLUDED.check_in_time,
            updated_at = EXCLUDED.updated_at,
            needs_sync = FALSE;
    `;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const ci of checkIns) {
            const values = [ci.id, ci.event_id, ci.participant_id, ci.session_id, ci.check_in_time, ci.updated_at];
            await client.query(upsertQuery, values);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

/**
 * Performs a bulk "upsert" for sessions.
 * @param {Array} sessions An array of session objects from a kiosk.
 */
async function bulkUpsertSessions(sessions) {
    if (!sessions || sessions.length === 0) return;
    const upsertQuery = `
        INSERT INTO sessions (id, event_id, session_date, name, max_checkins, updated_at, needs_sync)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE)
        ON CONFLICT (id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            session_date = EXCLUDED.session_date,
            name = EXCLUDED.name,
            max_checkins = EXCLUDED.max_checkins,
            updated_at = EXCLUDED.updated_at,
            needs_sync = FALSE;
    `;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const s of sessions) {
            const values = [s.id, s.event_id, s.session_date, s.name, s.max_checkins, s.updated_at];
            await client.query(upsertQuery, values);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

/**
 * Performs a bulk "upsert" for print templates.
 * @param {Array} templates An array of print template objects from a kiosk.
 */
async function bulkUpsertPrintTemplates(templates) {
    if (!templates || templates.length === 0) return;
    const upsertQuery = `
        INSERT INTO print_templates (id, event_id, template_name, template_data, updated_at, needs_sync)
        VALUES ($1, $2, $3, $4, $5, FALSE)
        ON CONFLICT (id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            template_name = EXCLUDED.template_name,
            template_data = EXCLUDED.template_data,
            updated_at = EXCLUDED.updated_at,
            needs_sync = FALSE;
    `;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const t of templates) {
            // template_data is JSONB, but the pg driver handles the stringification
            const values = [t.id, t.event_id, t.template_name, t.template_data, t.updated_at];
            await client.query(upsertQuery, values);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function updateEventSyncTimestamp(eventId) {
    const result = await query(
        `UPDATE events SET last_kiosk_sync_at = NOW() WHERE id = $1`,
        [eventId]
    );
    return { changes: result.rowCount };
}

/* ==============================
   TICKETING MATRIX MANAGEMENT
============================== */
/**
 * Fetches all pricing data for a specific event to populate the matrix UI.
 * @param {number} eventId The ID of the event.
 * @returns {Array} An array of objects, e.g., [{ role_name, tier_name, price }]
 */
async function getEventPricing(eventId) {
    const result = await query(`SELECT role_name, tier_name, price FROM ticket_types WHERE event_id = $1`, [eventId]);
    return result.rows;
}

/**
 * Saves the entire pricing matrix for an event.
 * It deletes old price points not in the new submission and then "upserts"
 * (inserts or updates) all current price points.
 * @param {number} eventId The ID of the event.
 * @param {object} pricingData The pricing data object from the frontend, e.g., { 'Delegate_Standard': 5000 }
 */
async function saveEventPricing(eventId, pricingData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // This query deletes any role/tier combinations for the event that are
        // NOT present in the latest submission from the frontend.
        const deleteQuery = `
            DELETE FROM ticket_types
            WHERE event_id = $1 AND (role_name, tier_name) NOT IN (
                SELECT
                    split_part(key, ',', 1),
                    split_part(key, ',', 2)
                FROM unnest($2::text[]) as t(key)
            )
        `;
        
        const compositeKeys = Object.keys(pricingData).map(key => key.replace('_', ','));

        if (compositeKeys.length > 0) {
            await client.query(deleteQuery, [eventId, compositeKeys]);
        } else {
             // If the submission is empty, delete all pricing for the event
             await client.query(`DELETE FROM ticket_types WHERE event_id = $1`, [eventId]);
        }

        // Now, insert or update all the submitted price points
        const upsertQuery = `
            INSERT INTO ticket_types (event_id, role_name, tier_name, price)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (event_id, role_name, tier_name) 
            DO UPDATE SET price = EXCLUDED.price;
        `;

        for (const [key, price] of Object.entries(pricingData)) {
            const [role_name, tier_name] = key.split('_');
            const priceValue = (price === '' || price === null) ? null : parseFloat(price);
            
            // Only save if there is a valid price value
            if (role_name && tier_name && priceValue !== null) {
                await client.query(upsertQuery, [eventId, role_name, tier_name, priceValue]);
            }
        }
        
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e; // Re-throw the error to be caught by the server handler
    } finally {
        client.release();
    }
}

module.exports = {
    query,
    // User functions...
    createUser,
    getUserByUsername,
    getAllUsers,
    deleteUser,
    assignEventToUser,
    // Event functions...
    addEvent,
    updateEvent,
    deleteEvent,
    getAllEventsWithStats,
    getEventById,
    // Venue Functions (NEW)
    getVenuesForEvent,
    addVenue,
    updateVenue,
    deleteVenue,
    // Hall Functions (NEW)
    getHallsForEvent,
    addHall,
    updateHall,
    deleteHall,
    // Session Functions...
    addSession,
    updateSession,
    deleteSession,
    getSessionsByEvent,
    deleteAllSessionsForEvent,
    // Other existing functions...
    getDashboardStats,
    addParticipant,
    updateParticipant,
    getParticipants,
    getParticipantByRegno,
    getParticipantsByIds,
    deleteParticipant,
    getNextRegNo,
    addCheckIn,
    getCheckInsBySession,
    addPrintTemplate,
    updatePrintTemplate,
    deletePrintTemplate,
    getAllPrintTemplates,
    getPrintTemplateById,
    getFullEventData,
    getUpdatesSince,
    bulkUpsertParticipants,
    bulkUpsertCheckIns,
    bulkUpsertSessions,
    bulkUpsertPrintTemplates,
    updateEventSyncTimestamp,
    getEventPricing,
    saveEventPricing,
};