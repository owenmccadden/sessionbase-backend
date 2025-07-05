const axios = require('axios');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { generateToken, createResponse, createErrorResponse } = require('./authUtils');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const USER_BUCKET_NAME = process.env.USER_BUCKET_NAME;
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

    // Store user information
    const userData = {
      id: user.id,
      login: user.login,
      email: primaryEmail,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      updated_at: new Date().toISOString(),
      github_access_token: access_token, // Store for future API calls if needed
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: USER_BUCKET_NAME,
      Key: `users/${user.id}.json`,
      Body: JSON.stringify(userData),
      ContentType: 'application/json',
    }));

    // Generate JWT token
    const jwtToken = generateToken(userData);

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
