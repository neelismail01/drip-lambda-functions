const { MongoClient, ObjectId } = require('mongodb');
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

  const db = client.db('drip-beta-db');

  cachedDb = db;
  return db;
}

exports.handler = async (event, context) => {

  try {
    context.callbackWaitsForEmptyEventLoop = false;
  
    const db = await connectToDatabase();
    
    const userEmail = event['body-json']['email'];
    const userName = event['body-json']['name'];
    const userPassword = event['body-json']['password']
  
    const userExists = await db.collection('users').find({ email: userEmail }).toArray();
    
    if (userExists.length > 0) {
      return {
        statusCode: 400,
        body: "A user with this email already exists."
      }
    }
    
    const user = await db.collection('users').insertOne({
      email: userEmail,
      name: userName,
      passwordHash: bcrypt.hashSync(userPassword, 10)
    });

    if (accessTokenSecret === null) {
      accessTokenSecret = await getParams('access-token-secret-jwt');
    }

    const accessToken = jwt.sign(ObjectId(user.insertedId).toString(), accessTokenSecret);
  
    return {
      statusCode: 200,
      body: {
        accessToken: accessToken,
        userInfo: {
          _id: ObjectId(user.insertedId).toString(),
          name: userName,
          email: userEmail
        }
      }
    };
    
  } catch (err) {
    
    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while creating your account."
    }

  }
};