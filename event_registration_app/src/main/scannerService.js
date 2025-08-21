require('dotenv').config();
const jwt = require('jsonwebtoken');

// This MUST be the same secret key used in qrService.js
const JWT_SECRET = process.env.QR_JWT_SECRET || 'a-default-fallback-for-development';
/**
 * Verifies the signature of a JWT and decodes it.
 * @param {string} token - The JWT scanned from the QR code.
 * @returns {{success: boolean, regno?: string, message?: string}}
 */
function verifyToken(token) {
  try {
    // This now correctly decodes the payload looking for the 'regno' key.
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.regno) {
      return { success: true, regno: decoded.regno };
    }
    return { success: false, message: 'Invalid token payload. "regno" missing.' };
  } catch (err) {
    // This will catch malformed tokens, expired tokens, etc.
    return { success: false, message: `Token verification failed: ${err.message}` };
  }
}

module.exports = {
  verifyToken,
};