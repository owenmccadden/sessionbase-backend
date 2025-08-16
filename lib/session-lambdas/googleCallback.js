const axios = require('axios');
const { generateToken, createResponse, createErrorResponse, validateOAuthState, deleteOAuthState, generateAuthCode, storeAuthCode } = require('./authUtils');
const { upsertUser } = require('./userUtils');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
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

    console.log('OAuth state validated successfully for Google');

    // Construct the callback URL (must match what was used in auth request)
    const baseUrl = `https://${event.requestContext.domainName}`;
    const callbackUrl = `${baseUrl}/auth/google/callback`;

    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const { access_token, id_token } = tokenResponse.data;
    
    if (!access_token) {
      return {
        statusCode: 302,
        headers: {
          'Location': `${FRONTEND_URL}/discover?error=token_exchange_failed`,
        },
      };
    }

    // Get user information from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    const googleUser = userResponse.data;

    // Transform Google user data to match our user schema
    // Google uses different field names than GitHub, so we need to normalize
    const userData = {
      id: `google_${googleUser.id}`, // Prefix to avoid conflicts with GitHub IDs
      login: googleUser.email.split('@')[0], // Use email prefix as username
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture,
      provider: 'google',
      created_at: new Date().toISOString(),
    };

    console.log('Storing Google user data for:', {
      userId: userData.id,
      username: userData.login,
      email: userData.email,
      hasAvatar: !!userData.avatar_url
    });

    // Store/update user information in DynamoDB
    const storedUser = await upsertUser(userData);

    // Generate JWT token - use normalized data structure
    const jwtToken = generateToken({
      id: userData.id,           // Our normalized ID with google_ prefix
      login: userData.login,     // Email prefix as username
      email: userData.email,     // Google email
      avatar_url: userData.avatar_url, // Google profile picture
      provider: 'google',        // Add provider info to token
    });

    console.log('Google OAuth successful for user:', {
      userId: userData.id,
      username: userData.login,
      email: userData.email,
      tokenGenerated: !!jwtToken
    });

    // Generate secure one-time auth code instead of passing JWT directly
    const authCode = generateAuthCode();
    
    // Store the mapping of auth_code -> JWT with 60 second TTL
    await storeAuthCode(authCode, jwtToken, {
      provider: 'google',
      userId: userData.id,
      username: userData.login
    });

    console.log('Generated auth code for Google OAuth user:', {
      userId: userData.id,
      username: userData.login,
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
    console.error('Google callback error:', error);
    console.error('Error details:', error.response?.data || error.message);
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}/discover?error=auth_failed`,
      },
    };
  }
};
