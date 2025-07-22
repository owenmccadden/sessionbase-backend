const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

exports.main = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { email } = body;

    // Validate email
    if (!email || !email.includes('@') || email.length < 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid email address is required' }),
      };
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Store in DynamoDB
    const timestamp = new Date().toISOString();
    await docClient.send(new PutCommand({
      TableName: 'TeamsEmailSignups',
      Item: {
        email: normalizedEmail,
        signupDate: timestamp,
        source: 'teams-page',
      },
      ConditionExpression: 'attribute_not_exists(email)', // Prevent duplicates
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Successfully signed up for teams updates!' 
      }),
    };

  } catch (error) {
    console.error('Error in teams email signup:', error);
    
    // Handle duplicate email gracefully
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'You are already signed up for teams updates!' 
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to sign up. Please try again.' }),
    };
  }
};