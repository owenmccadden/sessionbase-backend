
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({});

exports.main = async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Missing id' }),
    };
  }

  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: id,
  });

  try {
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    
    // Determine content type based on stored metadata or content type
    const storedContentType = response.ContentType;
    const dataFormat = response.Metadata?.['data-format'];
    
    let responseContentType = 'application/json'; // default
    if (storedContentType === 'application/jsonl' || dataFormat === 'jsonl') {
      responseContentType = 'application/jsonl';
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': responseContentType
      },
      body: body || '',
    };
  } catch (error) {
    console.error('Error in getSession:', error);
    
    if (error.name === 'NoSuchKey') {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Session not found' }),
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Error getting session' }),
    };
  }
};
