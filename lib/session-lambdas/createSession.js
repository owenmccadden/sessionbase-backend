const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { parseRequestBody, toJsonl } = require('./jsonlUtils');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { createSessionMetadata } = require('./dynamoUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  try {
    // Authentication is now required for all session creation
    const user = getUserFromEvent(event);
    
    if (!user) {
      return createErrorResponse(401, 'Authentication required to create sessions');
    }

    // Handle Base64 encoded bodies from API Gateway
    let requestBody = event.body || '{}';
    
    // If API Gateway indicates the body is Base64 encoded, decode it
    if (event.isBase64Encoded && requestBody) {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
    }
    
    // Parse the request body (handles both JSON and JSONL)
    const data = parseRequestBody(requestBody);
    const sessionId = uuidv4(); // Always generate a UUID

    // Determine if session should be private (default to false if not specified)
    const isPrivate = data.isPrivate === true;
    
    console.log('Session creation:', {
      sessionId,
      userId: user.userId,
      username: user.username,
      isPrivate
    });

    // Extract metadata from the request
    const {
      title,
      summary,
      tags,
      tokenCount,
      messageCount,
      modelName,
      isPrivate: _, // Remove from content data
      ...contentData
    } = data;

    // Determine the storage format based on input type
    let bodyToStore;
    let contentType = 'application/json';
    
    if (Array.isArray(data)) {
      // If data is an array (from JSONL), store as JSONL
      bodyToStore = toJsonl(data);
      contentType = 'application/jsonl';
    } else {
      // If data is an object (from JSON), store as JSON
      bodyToStore = JSON.stringify(contentData);
      contentType = 'application/json';
    }

    // Store the session content in S3
    const s3Command = new PutObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
      Body: bodyToStore,
      ContentType: contentType,
      Metadata: {
        'data-format': Array.isArray(data) ? 'jsonl' : 'json',
        'session-id': sessionId,
      }
    });

    await s3Client.send(s3Command);

    // Create session metadata in DynamoDB (user is always authenticated now)
    const sessionMetadata = await createSessionMetadata({
      sessionId,
      userId: user.userId,
      username: user.username,
      isPrivate,
      title: title || null,
      summary: summary || null,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : null,
      tokenCount: tokenCount || null,
      messageCount: messageCount || (Array.isArray(data) ? data.length : null),
      modelName: modelName || null,
    });

    console.log('Session created successfully:', {
      sessionId,
      isPrivate,
      userId: user.userId,
      hasMetadata: !!sessionMetadata
    });

    return createResponse(201, {
      message: 'Session created',
      id: sessionId,
      format: Array.isArray(data) ? 'jsonl' : 'json',
      recordCount: Array.isArray(data) ? data.length : 1,
      isPrivate,
      owner: {
        id: user.userId,
        username: user.username,
      },
      metadata: {
        title: sessionMetadata.title,
        summary: sessionMetadata.summary,
        tags: sessionMetadata.tags,
        tokenCount: sessionMetadata.tokenCount,
        messageCount: sessionMetadata.messageCount,
        modelName: sessionMetadata.modelName,
        createdAt: sessionMetadata.createdAt,
      }
    });

  } catch (error) {
    console.error('Error in createSession:', error);
    
    // If DynamoDB creation failed but S3 succeeded, we should clean up S3
    // For now, we'll log this and let it be handled manually
    if (error.message === 'Session already exists') {
      return createErrorResponse(409, 'Session with this ID already exists');
    }
    
    return createErrorResponse(400, `Error creating session: ${error.message}`);
  }
};
