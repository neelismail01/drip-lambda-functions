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

    await checkUserAuthorization(authToken, accessTokenSecret);
    const db = await connectToDatabase();

    /*
      BELOW IS THE LOGIC FOR GETTING TRENDING BRANDS WITHIN A PARTICULAR TIME PERIOD
      const dateObj = new Date();
      const prevMonth = (dateObj.getMonth() - 1) % 12 + 1;
      const currMonth = dateObj.getMonth() + 1;
      const day = String(dateObj.getDate()).padStart(2, '0');
      const year = dateObj.getFullYear();
      const dateRangeStart = `${year}-${prevMonth}-${day}`;
      const dateRangeEnd = `${year}-${currMonth}-${day}`

      {
        $match : {
            "datePosted": {
                $gte: new Date(dateRangeStart),
                $lte: new Date(dateRangeEnd)
            }
        }
      },
    */

    const trendingBrands = await db.collection('orders').aggregate([
        {
            $group: {
                _id: '$brandName',
                detail: { $first: '$$ROOT' },
                totalPosts: { $sum: 1 },
                totalLikes: { $sum: { $size: '$likedBy' } }
            }
        },
        {
            $sort: { totalLikes: -1 }
        },
        {
            $limit: 10
        },
        {
            $replaceRoot: {
              newRoot: { $mergeObjects: [{ totalPosts: '$totalPosts' }, { totalLikes: '$totalLikes' }, '$detail'] },
            },
        },
        {
            $project: {
                _id: 1,
                totalPosts: 1,
                totalLikes: 1,
                brandName: 1,
                brandLogo: 1,
                brandWebsite: 1
            }
        }
    ])
    .toArray()

    return {
      statusCode: 200,
      body: trendingBrands
    };

  } catch (err) {

    console.log(err);
    return {
      status: 500,
      body: "An error occurred while getting this user's total orders."
    }
  }
};