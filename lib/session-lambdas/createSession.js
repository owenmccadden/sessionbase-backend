const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { parseRequestBody, toJsonl } = require('./jsonlUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  try {
    // Handle Base64 encoded bodies from API Gateway
    let requestBody = event.body || '{}';
    
    // If API Gateway indicates the body is Base64 encoded, decode it
    if (event.isBase64Encoded && requestBody) {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
    }
    
    // Parse the request body (handles both JSON and JSONL)
    const data = parseRequestBody(requestBody);
    const id = uuidv4(); // Always generate a UUID

    // Determine the storage format based on input type
    let bodyToStore;
    let contentType = 'application/json';
    
    if (Array.isArray(data)) {
      // If data is an array (from JSONL), store as JSONL
      bodyToStore = toJsonl(data);
      contentType = 'application/jsonl';
    } else {
      // If data is an object (from JSON), store as JSON
      bodyToStore = JSON.stringify(data);
      contentType = 'application/json';
    }

    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: id,
      Body: bodyToStore,
      ContentType: contentType,
      Metadata: {
        'data-format': Array.isArray(data) ? 'jsonl' : 'json'
      }
    });

    await s3Client.send(command);
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: 'Session created', 
        id: id,
        format: Array.isArray(data) ? 'jsonl' : 'json',
        recordCount: Array.isArray(data) ? data.length : 1
      }),
    };
  } catch (error) {
    console.error('Error in createSession:', error);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        message: 'Error parsing request data', 
        error: error.message 
      }),
    };
  }
};
