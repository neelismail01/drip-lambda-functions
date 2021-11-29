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
    const query = event['params']['querystring']['searchTerm'];
    const limit = parseInt(event['params']['querystring']['limit']);
    const page = parseInt(event['params']['querystring']['page']);

    const friends = await db.collection('friends').aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                {
                  requester: ObjectId(userId),
                },
                {
                  recipient: ObjectId(userId),
                },
              ],
            },
            {
              status: "friends",
            },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          friendId: {
            $cond: {
              if: {
                $eq: ["$requester", ObjectId(userId)],
              },
              then: "$recipient",
              else: "$requester",
            },
          },
        },
      },
    ])
    .toArray();

    const friendList = friends.map((friend) => friend.friendId);

    const orders = await db.collection('orders').aggregate([
      {
        $match: {
          $and: [
            {
              user: { $in: friendList },
            },
            {
              $or: [
                {
                  brandName: {
                    $regex: new RegExp(query, "i"),
                  },
                },
                {
                  caption: {
                    $regex: new RegExp(query, "i"),
                  },
                },
                {
                  tags: {
                    $regex: new RegExp(query, "i")
                  }
                }
              ],
            },
          ]
        }
      },
      {
        $skip: limit * page
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
          $sort: {
              datePosted: -1
          }
      },
      {
        $project: {
          user: { $arrayElemAt: ['$user', 0] },
          pictureUrls: 1,
          tags: 1,
          brandName: 1,
          brandLogo: 1,
          brandWebsite: 1,
          caption: 1,
          datePosted: 1,
          likedBy: 1
        }
      }
    ])
    .toArray();

    return {
      statusCode: 200,
      body: orders
    };

  } catch (err) {

    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while collecting your friend's orders.",
    };
  }
};
