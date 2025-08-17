const { validateOAuthState, createResponse, createErrorResponse } = require('./authUtils');

/**
 * POST /auth/device/poll
 * Polls for device authorization completion
 */
exports.main = async (event) => {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST' && event.requestContext?.http?.method !== 'POST') {
      return createErrorResponse(405, 'Method not allowed');
    }

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    const { device_code } = body;

    if (!device_code) {
      return createErrorResponse(400, 'Missing device_code');
    }

    // Look up device code in OAuth state table
    const stateKey = `device_${device_code}`;
    const oauthState = await validateOAuthState(stateKey);

    if (!oauthState) {
      return createErrorResponse(400, 'Invalid or expired device code');
    }

    // Check if this is a device type OAuth state
    if (oauthState.type !== 'device') {
      return createErrorResponse(400, 'Invalid device code');
    }

    // Return status based on OAuth state
    if (oauthState.status === 'pending') {
      return createResponse(200, { status: 'pending' });
    } else if (oauthState.status === 'complete') {
      // Return the API key
      return createResponse(200, {
        status: 'complete',
        apiKey: oauthState.apiKey,
      });
    } else {
      // Unknown status
      return createErrorResponse(400, 'Invalid device code status');
    }
  } catch (error) {
    console.error('Error in device poll:', error);
    return createErrorResponse(500, 'Internal server error');
  }
};