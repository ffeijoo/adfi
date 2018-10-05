const AWS = require('aws-sdk');

const CUITS_API_URL = process.env.CUITS_API_URL;
const CUITS_BUCKET = process.env.CUITS_BUCKET;
const CUITS_KEY_PREFIX = process.env.CUITS_KEY_PREFIX;
const LOGINS_TABLE_NAME = process.env.LOGINS_TABLE_NAME;

AWS.config.update({ region: process.env.REGION });

const request = require('request-promise');

const s3 = new AWS.S3();
const ssm = new AWS.SSM();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {

  var params = {
    startDate: event.dates.start,
    runid: event.result.runid
  }

  var adfi = {
    getCuits: function(item, access) {
      return request({
        url: CUITS_API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AdFi-Access-Key' : access.key,
          'X-AdFi-Access-Secret' : access.secret
        },
        body: JSON.parse('[' + item.perfiles + ']'),
        json: true
      });
    }
  }

  var aws = {
    getSecrets: function(item) {
       return new Promise(function(resolve, reject) {
        return ssm.getParametersByPath({
          Path: '/org/adfi/location/' + item.loc,
          Recursive: true,
          WithDecryption: true }).promise()
        .then(
          function(data) { 
            let parameters = data.Parameters;
            let access = {};
            parameters.forEach(function(parameter){
              if (parameter.Name.includes('key'))
              access.key = parameter.Value;
              if (parameter.Name.includes('secret'))
              access.secret = parameter.Value;
            });
            resolve(access); 
          });
        });
      },
      queryByRunId: function() {
        return dynamoDb.query({
          TableName: LOGINS_TABLE_NAME,
          KeyConditionExpression: '#runid = :runid',
          ExpressionAttributeNames: {
             '#runid': 'runid'
          },
          ExpressionAttributeValues: {
            ':runid':params.runid,
          }
        }).promise();
      },
      storeCuits: function(item, response) {
        let key = CUITS_KEY_PREFIX + '/' + item.loc + '/' + 
          params.startDate.replace(/-/g , "/") + '/part-r-0000-' + params.runid + '.json';
        let cuits = response.cuits;
        return s3.putObject({
          Body: JSON.stringify(cuits),
          Bucket: CUITS_BUCKET,
          Key: key }).promise();
      }
    }

    aws.queryByRunId().then(
      (response) => { response.Items.forEach((item) => {
        aws.getSecrets(item)
          .then(adfi.getCuits.bind(adfi, item))
          .then(aws.storeCuits.bind(aws, item))
          .then(() => context.succeed());
      })
    });

  }