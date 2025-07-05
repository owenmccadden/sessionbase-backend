const { createResponse } = require('./authUtils');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;

exports.main = async (event) => {
  try {
    console.log('GitHub Client ID:', GITHUB_CLIENT_ID ? 'Set' : 'Missing');
    console.log('Event:', JSON.stringify(event, null, 2));

    if (!GITHUB_CLIENT_ID) {
      return createResponse(500, { error: 'GitHub Client ID not configured' });
    }

    // Generate a random state parameter for security
    const state = Math.random().toString(36).substring(2, 15) + 
                  Math.random().toString(36).substring(2, 15);
    
    // Construct the proper callback URL
    const baseUrl = `https://${event.requestContext.domainName}`;
    const callbackUrl = `${baseUrl}/auth/github/callback`;
    
    console.log('Callback URL:', callbackUrl);
    
    // GitHub OAuth URL
    const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${GITHUB_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `scope=user:email&` +
      `state=${state}`;

    console.log('GitHub Auth URL:', githubAuthUrl);

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
