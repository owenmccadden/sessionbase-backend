const axios = require('axios');
const { generateToken, createResponse, createErrorResponse, validateOAuthState, deleteOAuthState, generateAuthCode, storeAuthCode } = require('./authUtils');
const { upsertUser } = require('./userUtils');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;

exports.main = async (event) => {
  try {
    const { code, state } = event.queryStringParameters || {};
    
    if (!code) {
      return {
        statusCode: 302,
        headers: {
          'Location': `${FRONTEND_URL}/discover?error=missing_code`,
        },
      };
    }

    // Validate OAuth state for CSRF protection
    const storedState = await validateOAuthState(state);
    if (!storedState) {
      console.error('Invalid or expired OAuth state:', state);
      return {
        statusCode: 302,
        headers: {
          'Location': `${FRONTEND_URL}/discover?error=invalid_state`,
        },
      };
    }

    // Delete the used state to prevent replay attacks
    await deleteOAuthState(state);

    console.log('OAuth state validated successfully for GitHub');

    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
    }, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const { access_token } = tokenResponse.data;
    
    if (!access_token) {
      return {
        statusCode: 302,
        headers: {
          'Location': `${FRONTEND_URL}/discover?error=token_exchange_failed`,
        },
      };
    }

    // Get user information from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${access_token}`,
      },
    });

    const user = userResponse.data;

    // Get user's email (might be private)
    const emailResponse = await axios.get('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `token ${access_token}`,
      },
    });

    const primaryEmail = emailResponse.data.find(email => email.primary)?.email || user.email;

    // Prepare user data for DynamoDB storage
    const userData = {
      id: user.id,
      login: user.login,
      email: primaryEmail,
      name: user.name,
      avatar_url: user.avatar_url,
      provider: 'github',
      created_at: new Date().toISOString(),
    };

    console.log('Storing user data for:', {
      userId: user.id,
      username: user.login,
      hasEmail: !!primaryEmail
    });

    // Store/update user information in DynamoDB (not S3)
    const storedUser = await upsertUser(userData);

    // Generate JWT token - pass the original GitHub user object which has the expected field names
    const jwtToken = generateToken({
      id: user.id,           // generateToken expects 'id'
      login: user.login,     // generateToken expects 'login'  
      email: primaryEmail,   // generateToken expects 'email'
      avatar_url: user.avatar_url, // generateToken expects 'avatar_url'
    });

    console.log('GitHub OAuth successful for user:', {
      userId: user.id,
      username: user.login,
      tokenGenerated: !!jwtToken
    });

    // Generate secure one-time auth code instead of passing JWT directly
    const authCode = generateAuthCode();
    
    // Store the mapping of auth_code -> JWT with 60 second TTL
    await storeAuthCode(authCode, jwtToken, {
      provider: 'github',
      userId: user.id,
      username: user.login
    });

    console.log('Generated auth code for GitHub OAuth user:', {
      userId: user.id,
      username: user.login,
      authCodeGenerated: !!authCode
    });

    // Redirect to frontend with secure auth code instead of JWT
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}/discover?auth_code=${authCode}`,
      },
    };

  } catch (error) {
    console.error('GitHub callback error:', error);
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}/discover?error=auth_failed`,
      },
    };
  }
};
