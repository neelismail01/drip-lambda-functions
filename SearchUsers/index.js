const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId

const CONNECTION_STRING = "mongodb+srv://nikhil-ismail:nikhil2002@cluster0.ookje.mongodb.net/eshop-database?retryWrites=true&w=majority";

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const client = await MongoClient.connect(CONNECTION_STRING);
  const db = client.db("eshop-database");

  cachedDb = db;
  return db;
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const db = await connectToDatabase();
  
  const query = event['params']['query']['searchTerm'];
  const userId = event['params']['path']['userId']
  
  const userFriends = await db.collections('friends').aggregate([
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
        $project: {
          requester: { $arrayElemAt: ['$requester', 0] },
          recipient: { $arrayElemAt: ['$recipient', 0] },
          status: 1,
        },
      },
      {
        $limit: 10,
      },
  ])
  .toArray()
  
  
  const userMatches = await db.collections('users').aggregate([
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
      $project: {
        name: 1,
        email: 1,
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
  const passedFriendsCheck = true;

    for (let i = 0; i < userMatches.length; i++) {
      for (let j = 0; j < userFriends.length; j++) {
        const friendshipStatus = userFriends[j].status;
        const isFriendshipRecipient = String(userMatches[i]._id) === String(userFriends[j].requester._id);
        const isFriendshipRequester = String(userMatches[i]._id) === String(userFriends[j].recipient._id)
          
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

  const response = {
    statusCode: 200,
    body: {
      friends,
      friendRequests,
      newUsers
    }
  };

  return response;
};