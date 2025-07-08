const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USER_TABLE_NAME = process.env.USER_METADATA_TABLE_NAME;

/**
 * Create or update user metadata
 * @param {Object} userData - User data from GitHub
 * @returns {Promise<Object>} - Created/updated user metadata
 */
async function upsertUser(userData) {
  const timestamp = new Date().toISOString();
  
  const userMetadata = {
    userId: userData.id.toString(), // Convert to string for consistency
    username: userData.login,
    email: userData.email,
    name: userData.name,
    avatarUrl: userData.avatar_url,
    githubCreatedAt: userData.created_at,
    createdAt: timestamp, // First time we see this user
    updatedAt: timestamp,
    lastLoginAt: timestamp,
    // Don't store the GitHub access token in DynamoDB for security
  };

  // Use UpdateCommand with upsert behavior
  const command = new UpdateCommand({
    TableName: USER_TABLE_NAME,
    Key: { userId: userMetadata.userId },
    UpdateExpression: `
      SET username = :username,
          email = :email,
          #name = :name,
          avatarUrl = :avatarUrl,
          githubCreatedAt = :githubCreatedAt,
          updatedAt = :updatedAt,
          lastLoginAt = :lastLoginAt,
          createdAt = if_not_exists(createdAt, :createdAt)
    `,
    ExpressionAttributeNames: {
      '#name': 'name', // 'name' is a reserved word in DynamoDB
    },
    ExpressionAttributeValues: {
      ':username': userMetadata.username,
      ':email': userMetadata.email,
      ':name': userMetadata.name,
      ':avatarUrl': userMetadata.avatarUrl,
      ':githubCreatedAt': userMetadata.githubCreatedAt,
      ':updatedAt': userMetadata.updatedAt,
      ':lastLoginAt': userMetadata.lastLoginAt,
      ':createdAt': userMetadata.createdAt,
    },
    ReturnValues: 'ALL_NEW',
  });

  try {
    const response = await docClient.send(command);
    return response.Attributes;
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}

/**
 * Get user metadata by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - User metadata or null if not found
 */
async function getUser(userId) {
  const command = new GetCommand({
    TableName: USER_TABLE_NAME,
    Key: { userId: userId.toString() },
  });

  try {
    const response = await docClient.send(command);
    return response.Item || null;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

/**
 * Update user's last login timestamp
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Updated user metadata
 */
async function updateLastLogin(userId) {
  const timestamp = new Date().toISOString();
  
  const command = new UpdateCommand({
    TableName: USER_TABLE_NAME,
    Key: { userId: userId.toString() },
    UpdateExpression: 'SET lastLoginAt = :lastLoginAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':lastLoginAt': timestamp,
      ':updatedAt': timestamp,
    },
    ReturnValues: 'ALL_NEW',
  });

  try {
    const response = await docClient.send(command);
    return response.Attributes;
  } catch (error) {
    console.error('Error updating last login:', error);
    throw error;
  }
}

module.exports = {
  upsertUser,
  getUser,
  updateLastLogin,
};
