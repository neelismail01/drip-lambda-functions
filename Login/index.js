const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const aws = require('aws-sdk');
const jwt = require('jsonwebtoken');

aws.config.loadFromPath('./config.json');

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

  mongodbUri = await getParams('connection-uri-mongodb');
  const client = await MongoClient.connect(mongodbUri);

  const db = client.db('eshop-database');

  cachedDb = db;
  return db;
}

exports.handler = async (event, context) => {

  try {
    context.callbackWaitsForEmptyEventLoop = false;
  
    const db = await connectToDatabase();
    
    const userEmail = event['body-json']['email'];
    const userPassword = event['body-json']['password']
  
    const userExists = await db.collection('users').find({ email: userEmail }).toArray();
    
    if (userExists.length > 0 && bcrypt.compareSync(userPassword, userExists[0].passwordHash)) {

      if (accessTokenSecret === null) {
        accessTokenSecret = await getParams('access-token-secret-jwt');
      }

      const accessToken = jwt.sign(userEmail, accessTokenSecret);

      return {
        statusCode: 200,
        body: { accessToken: accessToken }
      }
    }
  
    return {
      statusCode: 400,
      body: "The provided login credentials do not match any registered users."
    };
    
  } catch (err) {
    
    return {
      statusCode: 500,
      body: "An error occurred while validating login credentials."
    }

  }
};