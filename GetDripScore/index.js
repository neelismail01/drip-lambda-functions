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

exports.handler = async (event, context) => {

  try {

    context.callbackWaitsForEmptyEventLoop = false;

    const authHeader = event['params']['header']['Authorization'];
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

      userId = event['params']['path']['userId'];
    })

    const db = await connectToDatabase();

    const query = await db.collection('orders').aggregate([
      {
        $match: {
          user: ObjectId(userId)
        }
      },
      {
        $group: {
          _id: '',
          total_likes: {
            $sum: {
              $size: "$likedBy"
            }
          }
        }
      }
    ])
    .toArray();
    
    const dripScore = query.length > 0 ? query[0].total_likes : 0;
  
    return {
      statusCode: 200,
      body: dripScore
    };

  } catch (err) {

    console.log(err);
    return {
      status: 500,
      body: "An error occurred while getting this user's drip score."
    }

  }
};