const { createResponse, createErrorResponse, exchangeAuthCode } = require('./authUtils');

exports.main = async (event) => {
  try {
    console.log('Auth exchange request:', JSON.stringify(event, null, 2));

    // Handle both GET and POST requests
    let authCode;
    
    // API Gateway v2 uses event.requestContext.http.method
    const method = event.requestContext?.http?.method || event.httpMethod;
    
    if (method === 'GET') {
      // Extract auth_code from query parameters
      authCode = event.queryStringParameters?.auth_code;
    } else if (method === 'POST') {
      // Extract auth_code from request body
      const body = JSON.parse(event.body || '{}');
      authCode = body.auth_code;
    }

    if (!authCode) {
      console.log('Missing auth_code parameter');
      return createErrorResponse(400, 'Missing auth_code parameter');
    }

    console.log('Attempting to exchange auth code:', authCode.substring(0, 8) + '...');

    // Exchange the auth code for JWT
    const jwt = await exchangeAuthCode(authCode);

    if (!jwt) {
      console.log('Invalid or expired auth code:', authCode.substring(0, 8) + '...');
      return createErrorResponse(400, 'Invalid or expired auth code');
    }

    console.log('Successfully exchanged auth code for JWT');

    // Return the JWT in the response body
    return createResponse(200, {
      token: jwt,
      message: 'Auth code exchanged successfully'
    });

  } catch (error) {
    console.error('Auth exchange error:', error);
    return createErrorResponse(500, 'Internal server error');
  }
};