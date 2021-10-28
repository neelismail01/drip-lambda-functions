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

  const query = await db.collection("orders").aggregate([
    {
      $match: {
        user: ObjectId(event.params.path.userId)
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

  const response = {
    statusCode: 200,
    body: dripScore
  };

  return response;
};