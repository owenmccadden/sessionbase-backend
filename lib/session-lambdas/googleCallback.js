const axios = require('axios');
const { generateToken, createResponse, createErrorResponse } = require('./authUtils');
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
          'Location': `${FRONTEND_URL}?error=missing_code`,
        },
      };
    }

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
          'Location': `${FRONTEND_URL}?error=token_exchange_failed`,
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

    // Redirect to frontend with token
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}?token=${jwtToken}`,
      },
    };

  } catch (error) {
    console.error('Google callback error:', error);
    console.error('Error details:', error.response?.data || error.message);
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}?error=auth_failed`,
      },
    };
  }
};
