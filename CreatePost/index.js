const { MongoClient, ObjectId } = require("mongodb");
const aws = require("aws-sdk");
const jwt = require("jsonwebtoken");

aws.config.loadFromPath("./config.json");

const ssm = new aws.SSM({
  apiVersion: "2014-11-06",
  region: "us-east-2",
});

const s3 = new aws.S3()

const uploadImageToS3 = async (pictureBase64, pictureUri) => {
    const uploadParams = {
        Bucket: 'drip-inc',
        Key: pictureUri,
        Body: pictureBase64,
        ContentEncoding: 'base64',
        ContentType: 'image/jpeg'
    }

    return s3.upload(uploadParams).promise();
}

const getParams = async (param) => {
  const request = await ssm
    .getParameter({
      Name: param,
    })
    .promise();

  return request.Parameter.Value;
};

let mongodbUri = null;
let cachedDb = null;
let accessTokenSecret = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  mongodbUri = await getParams("connection-uri-mongodb");
  const client = await MongoClient.connect(mongodbUri);

  const db = client.db("eshop-database");

  cachedDb = db;
  return db;
}

exports.handler = async (event, context) => {

  try {
    
    context.callbackWaitsForEmptyEventLoop = false;

   /* const authHeader = event['params']['header']['Authorization'];
    const authToken = authHeader && authHeader.split(" ")[1];
    let userId = null;

    if (authToken === null) {
      return {
        status: 401,
        body: "You do not have an authorization token."
      }
    }

    if (accessTokenSecret === null) {
      accessTokenSecret = await getParams('access-token-secret-jwt');
    }

    jwt.verify(authToken, accessTokenSecret, (err, user) => {
      if (err) {
        return {
          status: 403,
          body: "You do not have a valid authorization token."
        }
      }

      userId = user;
    })

    const db = await connectToDatabase();
    */

    console.log(event);
   await uploadImageToS3(event['body-json'].pictures[0].base64, event['body-json'].pictures[0].uri);
  
    return {
      statusCode: 200,
      body: "The image was uploaded."
    };
  
  } catch (err) {

    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while accepting the friend request."
    };

  }
};