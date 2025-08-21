require('dotenv').config();
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

// This MUST be a secure, consistent secret key.
const JWT_SECRET = process.env.QR_JWT_SECRET || 'a-default-fallback-for-development';
/**
 * Generates a signed JWT containing the participant's registration number.
 * @param {object} participant - The participant object, must contain a 'regno' property.
 * @returns {string} The signed JWT.
 */
function generateSignedToken(participant) {
  if (!participant || !participant.regno) {
    throw new Error('Participant data with a valid "regno" is required.');
  }
  // The payload uses 'regno' to be consistent.
  const payload = { regno: participant.regno };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1y' });
}

/**
 * Generates a QR code image from a given token.
 * @param {string} token - The signed JWT.
 * @returns {Promise<string>} A Data URL (base64) of the QR code image.
 */
function generateQRCodeDataURL(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 0.92,
    margin: 1,
  });
}

module.exports = {
  generateSignedToken,
  generateQRCodeDataURL,
};