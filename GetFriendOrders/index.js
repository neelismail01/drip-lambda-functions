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

  const friends = await db.collection("friends").aggregate([
    {
      $match: {
        $and: [
          {
            $or: [
              {
                "requester": ObjectId(event.params.path.userId)
              },
              {
                "recipient": ObjectId(event.params.path.userId)
              }
            ]
          },
          {
            "status": "friends"
          }
        ]
      }
    },
    {
      $project: {
        _id: 0,
        friendId: {
          $cond: {
            if: {
              "$eq": ["$requester", ObjectId(event.params.path.userId)]
            },
            then: "$recipient",
            else: "$requester"
          }
        }
      }
    }
  ])
  .toArray();
  
  const friendList = friends.map(friend => friend.friendId)
  
    const orders = await db.collection("orders").aggregate([
    {
        $match: {
            'user': { $in: friendList }
        }
    },
    {
        $lookup: {
            'from': 'orderitems',
            'localField': 'orderItems',
            'foreignField': '_id',
            'as': 'orderItems',
        }
    },
    {
        $lookup: {
            'from': 'products',
            'localField': 'orderItems.product',
            'foreignField': '_id',
            'as': 'orderItems.product',
        }
    },
    {
        $lookup: {
            'from': 'users',
            'localField': 'user',
            'foreignField': '_id',
            'as': 'user',
        }
    },
    {
        $lookup: {
            'from': 'businesses',
            'localField': 'business',
            'foreignField': '_id',
            'as': 'business',
        }
    },
    {
        $sort: {
            'dateOrdered': -1
        }
    },
    {
      $project: {
        'business': { $arrayElemAt: ['$business', 0] },
        'user': { $arrayElemAt: ['$user', 0] },
        'orderItems.product': { $arrayElemAt: ['$orderItems.product', 0] },
      },
    }
  ])
  .toArray();

  const response = {
    statusCode: 200,
    body: orders
  };

  return response;
};