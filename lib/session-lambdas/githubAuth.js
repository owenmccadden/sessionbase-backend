const { createResponse, generateOAuthState, storeOAuthState } = require('./authUtils');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;

exports.main = async (event) => {
  try {
    console.log('GitHub Client ID:', GITHUB_CLIENT_ID ? 'Set' : 'Missing');
    console.log('Event:', JSON.stringify(event, null, 2));

    if (!GITHUB_CLIENT_ID) {
      return createResponse(500, { error: 'GitHub Client ID not configured' });
    }

    // Generate cryptographically secure state parameter
    const state = generateOAuthState();
    
    // Store state in DynamoDB with metadata
    await storeOAuthState(state, {
      provider: 'github',
      userAgent: event.headers?.['user-agent'] || 'unknown',
      ip: event.requestContext?.http?.sourceIp || 'unknown'
    });
    
    // Construct the proper callback URL
    const baseUrl = `https://${event.requestContext.domainName}`;
    const callbackUrl = `${baseUrl}/auth/github/callback`;
    
    console.log('Callback URL:', callbackUrl);
    console.log('Generated state for GitHub OAuth:', state);
    
    // GitHub OAuth URL
    const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${GITHUB_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `scope=user:email&` +
      `state=${state}`;

    console.log('GitHub Auth URL constructed');

    return {
      statusCode: 302,
      headers: {
        'Location': githubAuthUrl,
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (error) {
    console.error('GitHub auth error:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
