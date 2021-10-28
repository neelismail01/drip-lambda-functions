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

  const data = {
    requester: ObjectId(event['body-json']['requester']),
    recipient: ObjectId(event['body-json']['recipient']),
    status: "pending"
  }
  await db.collection('friends').insertOne(data)

  const response = {
    statusCode: 200,
    body: "friend request successfully sent"
  };

  return response;
};