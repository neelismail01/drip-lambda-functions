const { MongoClient, ObjectId } = require("mongodb");
const aws = require("aws-sdk");
const jwt = require("jsonwebtoken");

aws.config.loadFromPath("./config.json");

const ssm = new aws.SSM({
  apiVersion: "2014-11-06",
  region: "us-east-2",
});

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

  const db = client.db("drip-beta-db");

  cachedDb = db;
  return db;
}

const checkUserAuthorization = async (authToken, accessTokenSecret) => {
  return new Promise((resolve, reject) => {
      jwt.verify(authToken, accessTokenSecret, (err, userId) => {
          if (err) {
              reject("Invalid auth token");
          }
          resolve(userId);
      })
  })
}

exports.handler = async (event, context) => {

  try {
    
    context.callbackWaitsForEmptyEventLoop = false;

    const authHeader = event['params']['header']['Authorization'];
    const authToken = authHeader && authHeader.split(" ")[1];

    if (accessTokenSecret === null) {
      accessTokenSecret = await getParams('access-token-secret-jwt');
    }

    const userId = await checkUserAuthorization(authToken, accessTokenSecret);
    const db = await connectToDatabase();
    const pictureUrls = event['body-json']['pictureUrls'];
    const tags = event['body-json']['tags'];
    const brandName = event['body-json']['brandName'];
    const brandLogo = event['body-json']['brandLogo'];
    const brandWebsite = event['body-json']['brandWebsite'];
    const caption = event['body-json']['caption'];
    const datePosted = new Date();
    const likedBy = [];

    await db.collection('orders').insertOne({
      user: ObjectId(userId),
      pictureUrls,
      tags,
      brandName,
      brandLogo,
      brandWebsite,
      caption,
      datePosted,
      likedBy
    })

    return {
      statusCode: 200,
      body: "The post was successfully created."
    };
  
  } catch (err) {

    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while creating this post."
    };

  }
};