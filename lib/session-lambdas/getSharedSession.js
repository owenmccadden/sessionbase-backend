const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { verifyShareToken, getTokenInfo, createResponse, createErrorResponse } = require('./authUtils');
const { getSessionMetadata } = require('./dynamoUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  try {
    const shareToken = event.pathParameters?.token;
    
    if (!shareToken) {
      return createErrorResponse(400, 'Missing share token');
    }

    // Verify the share token with detailed error handling
    const tokenResult = verifyShareToken(shareToken);
    
    // Handle specific error cases
    if (tokenResult && tokenResult.error) {
      if (tokenResult.error === 'expired') {
        return createErrorResponse(410, 'Share link has expired');
      }
      if (tokenResult.error === 'invalid') {
        return createErrorResponse(401, 'Invalid share link');
      }
      return createErrorResponse(401, tokenResult.message || 'Share link verification failed');
    }
    
    if (!tokenResult) {
      return createErrorResponse(401, 'Invalid or expired share token');
    }

    const { sessionId } = tokenResult;

    // Get session metadata from DynamoDB
    const sessionMetadata = await getSessionMetadata(sessionId);
    
    if (!sessionMetadata) {
      return createErrorResponse(404, 'Session not found');
    }

    // Get token info for response headers
    const tokenInfo = getTokenInfo(shareToken);

    // Get the session content from S3
    const command = new GetObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();

    // Determine content type
    const storedContentType = response.ContentType;
    const dataFormat = response.Metadata?.['data-format'];
    
    let responseContentType = 'application/json';
    if (storedContentType === 'application/jsonl' || dataFormat === 'jsonl') {
      responseContentType = 'application/jsonl';
    }
    
    // Build response headers with session metadata
    const responseHeaders = {
      'Content-Type': responseContentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'X-Session-Shared': 'true',
      'X-Session-Owner': sessionMetadata.username || '',
      'X-Session-Title': sessionMetadata.title || '',
      'X-Session-Views': sessionMetadata.views.toString(),
      'X-Session-Upvotes': sessionMetadata.upvotes.toString(),
      'X-Session-Downvotes': sessionMetadata.downvotes.toString(),
      'X-Session-Created': sessionMetadata.createdAt,
    };

    // Add token expiration info to headers
    if (tokenInfo) {
      responseHeaders['X-Share-Has-Expiration'] = tokenInfo.hasExpiration.toString();
      if (tokenInfo.expiresAt) {
        responseHeaders['X-Share-Expires-At'] = tokenInfo.expiresAt.toISOString();
      }
      if (tokenInfo.issuedAt) {
        responseHeaders['X-Share-Created-At'] = tokenInfo.issuedAt.toISOString();
      }
    }
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: body || '',
    };

  } catch (error) {
    console.error('Error accessing shared session:', error);
    
    if (error.name === 'NoSuchKey') {
      return createErrorResponse(404, 'Shared session content not found');
    }
    
    return createErrorResponse(500, 'Error accessing shared session');
  }
};
