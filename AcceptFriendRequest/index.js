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
  
  const friendshipId = event['params']['path']['friendshipId'];

  await db.collection("friends").update(
      { '_id': ObjectId(friendshipId) },
      { $set: { status: "friends" }  }
  );

  const response = {
    statusCode: 200,
    body: "friend request accepted"
  };

  return response;
};
