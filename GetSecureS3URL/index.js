const aws = require('aws-sdk');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');
const randomBytes = promisify(crypto.randomBytes);

aws.config.loadFromPath("./config.json");

const ssm = new aws.SSM({
    apiVersion: "2014-11-06",
    region: "us-east-2",
});

const s3 = new aws.S3();
let accessTokenSecret = null;

const getParams = async (param) => {
    const request = await ssm.getParameter({
        Name: param,
    })
    .promise();
  
    return request.Parameter.Value;
};

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

        const rawBytes = await randomBytes(16);
        const key = rawBytes.toString('hex');

        const params = {
            Bucket: "drip-inc",
            Key: key,
            Expires: 60
        }
    
        const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

        return {
            status: 200,
            body: uploadUrl
        }

    } catch (err) {

        console.log(err);
        return {
            status: 500,
            body: "An error occurred while retrieving a signed url"
        }
    }
}