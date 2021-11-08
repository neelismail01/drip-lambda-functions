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
        body: "You do not have an authorization token"
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
    const query = event['params']['querystring']['searchTerm'];
    
    const userFriends = await db.collection('friends').aggregate([
      {
        $match: {
          $or: [
            {
              recipient: ObjectId(userId),
            },
            {
              requester: ObjectId(userId),
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'requester',
          foreignField: '_id',
          as: 'requester',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'recipient',
          foreignField: '_id',
          as: 'recipient',
        },
      },
      {
        $match: {
            $or: [
              {
                $and: [
                  {
                    'requester._id': { $ne: ObjectId(userId) },
                  },
                  {
                    $or: [
                      {
                        'requester.name': {
                          $regex: new RegExp(query, 'i'),
                        },
                      },
                      {
                        'requester.email': {
                          $regex: new RegExp(query, 'i'),
                        },
                      },
                    ],
                  },
                ],
              },
              {
                $and: [
                  {
                    'recipient._id': { $ne: ObjectId(userId) },
                  },
                  {
                    $or: [
                      {
                        'recipient.name': {
                          $regex: new RegExp(query, 'i'),
                        },
                      },
                      {
                        'recipient.email': {
                          $regex: new RegExp(query, 'i'),
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        {
          $limit: 10,
        },
        {
          $project: {
            requester: { $arrayElemAt: ['$requester', 0] },
            recipient: { $arrayElemAt: ['$recipient', 0] },
            status: 1,
          },
        },
    ])
    .toArray()
    
    
    const userMatches = await db.collection('users').aggregate([
      {
        $match: {
          $and: [
            {
              '_id': { $ne: ObjectId(userId) },
            },
            {
              $or: [
                {
                  name: { $regex: new RegExp(query, 'i') },
                },
                {
                  email: { $regex: new RegExp(query, 'i') },
                },
              ]
            },
          ],
        },
      },
      {
        $limit: 5,
      }
    ])
    .toArray()

    const friends = [];
    const friendRequests = [];
    const newUsers = [];
    let passedFriendsCheck = true;

    for (let i = 0; i < userMatches.length; i++) {
      for (let j = 0; j < userFriends.length; j++) {
        const friendshipStatus = userFriends[j].status;
        const isFriendshipRecipient = String(userMatches[i]._id) === String(userFriends[j].requester._id);
        const isFriendshipRequester = String(userMatches[i]._id) === String(userFriends[j].recipient._id);
          
        if (friendshipStatus === "friends" && (isFriendshipRequester || isFriendshipRecipient)) {
          friends.push(userFriends[j]);
          passedFriendsCheck = false;
        } else if (isFriendshipRecipient) {
          friendRequests.push(userFriends[j]);
          passedFriendsCheck = false;
        } else if (isFriendshipRequester) {
          passedFriendsCheck = false;
        }
      }

      if (passedFriendsCheck) {
        newUsers.push(userMatches[i]);
      }
      passedFriendsCheck = true;
    }

    return {
      statusCode: 200,
      body: {
        friends,
        friendRequests,
        newUsers
      }
    }
    
  } catch (err) {

    console.log(err);
    return {
      statusCode: 500,
      body: "An error occurred while searching for users.",
    };

  }
};