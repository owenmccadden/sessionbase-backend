const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const JWT_SECRET = process.env.JWT_SECRET;
const OAUTH_STATE_TABLE = process.env.OAUTH_STATE_TABLE_NAME;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.login,
      email: user.email,
      avatarUrl: user.avatar_url,
      provider: user.provider || 'github', // Default to github for backward compatibility
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}


/**
 * Verify and decode a JWT token with detailed error info
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log('Token verification failed:', error.message);
    return null;
  }
}


/**
 * Check if a token is expired without throwing
 */
function isTokenExpired(token) {
  try {
    jwt.verify(token, JWT_SECRET);
    return false;
  } catch (error) {
    return error.name === 'TokenExpiredError';
  }
}

/**
 * Get token expiration info
 */
function getTokenInfo(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const hasExpiration = decoded.exp !== undefined;
    const isExpired = hasExpiration ? decoded.exp < now : false;
    const expiresAt = hasExpiration ? new Date(decoded.exp * 1000) : null;
    
    return {
      hasExpiration,
      isExpired,
      expiresAt,
      issuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
      type: decoded.type || 'user',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Extract user from Authorization header
 */
function getUserFromEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  return verifyToken(token);
}

/**
 * Create a standardized API response
 */
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode, message) {
  return createResponse(statusCode, { error: message });
}

/**
 * Generate cryptographically secure OAuth state
 */
function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store OAuth state in DynamoDB with TTL
 */
async function storeOAuthState(state, metadata = {}) {
  const ttl = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
  
  const command = new PutCommand({
    TableName: OAUTH_STATE_TABLE,
    Item: {
      state,
      ttl,
      createdAt: new Date().toISOString(),
      ...metadata
    }
  });

  try {
    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error storing OAuth state:', error);
    throw error;
  }
}

/**
 * Retrieve and validate OAuth state from DynamoDB
 */
async function validateOAuthState(state) {
  if (!state) {
    return null;
  }

  const command = new GetCommand({
    TableName: OAUTH_STATE_TABLE,
    Key: { state }
  });

  try {
    const response = await docClient.send(command);
    
    if (!response.Item) {
      console.log('OAuth state not found:', state);
      return null;
    }

    // Check if expired (TTL should handle this, but double-check)
    const now = Math.floor(Date.now() / 1000);
    if (response.Item.ttl < now) {
      console.log('OAuth state expired:', state);
      return null;
    }

    return response.Item;
  } catch (error) {
    console.error('Error validating OAuth state:', error);
    return null;
  }
}

/**
 * Delete OAuth state after successful validation
 */
async function deleteOAuthState(state) {
  const command = new DeleteCommand({
    TableName: OAUTH_STATE_TABLE,
    Key: { state }
  });

  try {
    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting OAuth state:', error);
    // Don't throw - this is cleanup, shouldn't fail the flow
    return false;
  }
}

module.exports = {
  generateToken,
  verifyToken,
  isTokenExpired,
  getTokenInfo,
  getUserFromEvent,
  createResponse,
  createErrorResponse,
  generateOAuthState,
  storeOAuthState,
  validateOAuthState,
  deleteOAuthState,
};
