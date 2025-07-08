const axios = require('axios');
const { generateToken, createResponse, createErrorResponse } = require('./authUtils');
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
          'Location': `${FRONTEND_URL}?error=missing_code`,
        },
      };
    }

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
          'Location': `${FRONTEND_URL}?error=token_exchange_failed`,
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
      created_at: user.created_at,
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

    // Redirect to frontend with token
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}?token=${jwtToken}`,
      },
    };

  } catch (error) {
    console.error('GitHub callback error:', error);
    return {
      statusCode: 302,
      headers: {
        'Location': `${FRONTEND_URL}?error=auth_failed`,
      },
    };
  }
};
