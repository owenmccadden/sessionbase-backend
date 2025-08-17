const { verifyToken, validateOAuthState, createResponse, createErrorResponse } = require('./authUtils');
const { getUser } = require('./userUtils');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const OAUTH_STATE_TABLE = process.env.OAUTH_STATE_TABLE_NAME;

/**
 * POST /auth/device/complete
 * Completes device authorization flow by linking a JWT to a device code
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

    const { device_code, jwt } = body;

    if (!device_code || !jwt) {
      return createErrorResponse(400, 'Missing device_code or jwt');
    }

    // Verify the JWT token
    const user = verifyToken(jwt);
    if (!user) {
      return createErrorResponse(401, 'Invalid JWT token');
    }

    // Look up device code in OAuth state table
    const stateKey = `device_${device_code}`;
    const oauthState = await validateOAuthState(stateKey);

    if (!oauthState) {
      return createErrorResponse(400, 'Invalid or expired device code');
    }

    // Check if this is a device type OAuth state and still pending
    if (oauthState.type !== 'device') {
      return createErrorResponse(400, 'Invalid device code');
    }

    if (oauthState.status !== 'pending') {
      return createErrorResponse(400, 'Device code already completed or expired');
    }

    // Get user's existing API key
    const userRecord = await getUser(user.userId);
    if (!userRecord || !userRecord.apiKey) {
      return createErrorResponse(500, 'User API key not found');
    }

    // Update OAuth state to mark as complete with existing API key
    const updateCommand = new UpdateCommand({
      TableName: OAUTH_STATE_TABLE,
      Key: { state: stateKey },
      UpdateExpression: 'SET #status = :status, apiKey = :apiKey, completedAt = :completedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'complete',
        ':apiKey': userRecord.apiKey,
        ':completedAt': new Date().toISOString(),
      },
    });

    await docClient.send(updateCommand);

    // Return success (frontend will show success modal)
    return createResponse(200, {
      success: true,
      message: 'Device authorization completed successfully',
    });
  } catch (error) {
    console.error('Error in device complete:', error);
    return createErrorResponse(500, 'Internal server error');
  }
};