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
    });
  });
};

exports.handler = async (event, context) => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;

    const authHeader = event["params"]["header"]["Authorization"];
    const authToken = authHeader && authHeader.split(" ")[1];

    if (accessTokenSecret === null) {
      accessTokenSecret = await getParams("access-token-secret-jwt");
    }

    const userId = await checkUserAuthorization(authToken, accessTokenSecret);
    const db = await connectToDatabase();

    const friendRequests = await db
      .collection("friends")
      .aggregate([
        {
          $match: {
            $and: [
              {
                status: "pending",
              },
              {
                recipient: ObjectId(userId),
              },
            ],
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "requester",
            foreignField: "_id",
            as: "requester",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "recipient",
            foreignField: "_id",
            as: "recipient",
          },
        },
        {
          $project: {
            requester: { $arrayElemAt: ["$requester", 0] },
            recipient: { $arrayElemAt: ["$recipient", 0] },
            status: 1,
          },
        },
      ])
      .toArray();

    return {
      statusCode: 200,
      body: friendRequests,
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while searching for users.",
    };
  }
};
