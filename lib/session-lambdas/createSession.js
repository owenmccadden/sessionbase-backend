const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({});

exports.main = async (event) => {
  const data = JSON.parse(event.body || '{}'); // Use the entire body as data
  const id = uuidv4(); // Always generate a UUID

  // No need for a 'Missing data' check here, as the entire body is considered data.
  // An empty JSON object {} will be stored if the body is empty.

  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: id,
    Body: JSON.stringify(data),
  });

  try {
    await s3Client.send(command);
    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Session created', id: id }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error creating session' }),
    };
  }
};
