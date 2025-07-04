
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({});

exports.main = async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return {
      statusCode: 400,
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
    return {
      statusCode: 200,
      body: body || '',
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error getting session' }),
    };
  }
};
