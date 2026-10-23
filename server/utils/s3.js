const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Uploads a file to AWS S3
 * @param {Object} file - Multer file object
 * @param {String} folder - Target folder in S3 (e.g. 'invoices')
 */
exports.uploadToS3 = async (file, folder = 'general') => {
  const fileContent = fs.readFileSync(file.path);
  const key = `${folder}/${Date.now()}_${file.originalname}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: file.mimetype,
    ACL: 'public-read', // Change as per security needs
  };

  try {
    const data = await s3Client.send(new PutObjectCommand(params));
    // Return the public URL
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error("S3 Upload Error:", err);
    throw err;
  }
};
