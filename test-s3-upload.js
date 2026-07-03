const AWS = require('aws-sdk');
const s3Client = new AWS.S3({
  endpoint: 'https://1315d8727f44577cf9a8b3831b0b58f1.r2.cloudflarestorage.com',
  accessKeyId: '132c5fe2307f6d42551e125f7952a951',
  secretAccessKey: '340590379e73499ab9848d04ecf89a61ea778ecbcb28d5a656435e',
  signatureVersion: 'v4',
  region: 'auto',
  s3ForcePathStyle: true
});
const params = { Bucket: 'videos', Key: 'loja-01/test-upload.txt', Body: 'hello world from node' };
s3Client.putObject(params, function(err, data) {
  if (err) console.log("ERROR:", err.message, err.code);
  else console.log("SUCCESS:", data);
});
