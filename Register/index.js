const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require("bcryptjs");

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

  const userEmail = event['params']['path']['email']

  const userExists = await db.collections('users').findOne({ email: userEmail })
  
  const response = {}
  
  if (userExists) {
    response = {
      statusCode: 400,
      body: "A user with this email already exists",
    }
  }
  
  const userData = {
    name: event['body-json']['name'],
    email: event['body-json']['email'],
    address: {
      fullAddress: event['body-json']['name'],
      addressPrimaryText: event['body-json']['addressPrimaryText'],
      addressSecondaryText: event['body-json']['addressSecondaryText'],
      addressPlaceId: event['body-json']['addressPlaceId'],
      active: true
    },
    passwordHash: bcrypt.hashSync(event['body-json']['password'], 10)
  }
  
  const user = await db.collections('users').insertOne(userData)

  if (!user) {
    response = {
      statusCode: 400,
      body: "This user cannot be created",
    }
  }

  response = {
    statusCode: 200,
    body: { userInfo: user }
  }

  return response;
};