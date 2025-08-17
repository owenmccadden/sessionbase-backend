const crypto = require('crypto');
const { storeOAuthState, createResponse, createErrorResponse } = require('./authUtils');

/**
 * Generate a secure device code (32 bytes = 64 hex chars)
 */
function generateDeviceCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /auth/device/start
 * Initiates device authorization flow for CLI
 */
exports.main = async (event) => {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST' && event.requestContext?.http?.method !== 'POST') {
      return createErrorResponse(405, 'Method not allowed');
    }

    // Generate device code
    const deviceCode = generateDeviceCode();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verificationUrl = `${frontendUrl}/login?cli=true&device_code=${deviceCode}`;
    const expiresIn = 600; // 10 minutes
    const interval = 5; // Poll every 5 seconds

    // Store device code in OAuthState table with TTL
    await storeOAuthState(`device_${deviceCode}`, {
      status: 'pending',
      type: 'device',
      deviceCode,
    });

    // Return device flow response
    const response = {
      device_code: deviceCode,
      verification_url: verificationUrl,
      expires_in: expiresIn,
      interval: interval,
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error in device start:', error);
    return createErrorResponse(500, 'Internal server error');
  }
};