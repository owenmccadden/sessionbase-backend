const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

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

module.exports = {
  generateToken,
  verifyToken,
  isTokenExpired,
  getTokenInfo,
  getUserFromEvent,
  createResponse,
  createErrorResponse,
};
