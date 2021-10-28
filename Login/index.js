const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectId
const bcrypt = require("bcryptjs")

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
  
  const userEmail = event['body-json']['email']
  const userPassword = event['body-json']['password']
  
  const user = await db.collections('users').findOne({ email: userEmail })
  
  let response = {}
  
  if (user && bcrypt.compareSync(userPassword, user.passwordHash)) {
    response = {
      statusCode: 200,
      body: { userInfo: user }
    }
  } else {
    response = {
      statusCode: 401,
      body: "Incorrect password"
    }
  }

  return response;
};