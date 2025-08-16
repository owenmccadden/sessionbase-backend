const { createResponse, generateOAuthState, storeOAuthState } = require('./authUtils');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;

exports.main = async (event) => {
  try {
    console.log('Google Client ID:', GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
    console.log('Event:', JSON.stringify(event, null, 2));

    if (!GOOGLE_CLIENT_ID) {
      return createResponse(500, { error: 'Google Client ID not configured' });
    }

    // Generate cryptographically secure state parameter
    const state = generateOAuthState();
    
    // Store state in DynamoDB with metadata
    await storeOAuthState(state, {
      provider: 'google',
      userAgent: event.headers?.['user-agent'] || 'unknown',
      ip: event.requestContext?.http?.sourceIp || 'unknown'
    });
    
    // Construct the proper callback URL
    const baseUrl = `https://${event.requestContext.domainName}`;
    const callbackUrl = `${baseUrl}/auth/google/callback`;
    
    console.log('Callback URL:', callbackUrl);
    console.log('Generated state for Google OAuth:', state);
    
    // Google OAuth URL
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('openid profile email')}&` +
      `state=${state}`;

    console.log('Google Auth URL constructed');

    return {
      statusCode: 302,
      headers: {
        'Location': googleAuthUrl,
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (error) {
    console.error('Google auth error:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
