const AWS = require('aws-sdk');

const LOGINS_API_URL = process.env.LOGINS_API_URL;
const LOGINS_BUCKET = process.env.LOGINS_BUCKET;
const LOGINS_KEY_PREFIX = process.env.LOGINS_KEY_PREFIX;
const LOGINS_TABLE_NAME = process.env.LOGINS_TABLE_NAME;

AWS.config.update({ region: process.env.REGION });

const moment = require('moment');
const request = require('request-promise');

const s3 = new AWS.S3();
const ssm = new AWS.SSM();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {

  var params = {
    loc: event.iterator.loc,
    startDate: event.dates.start, 
    endDate: event.dates.end,
    runid: event.result  ? event.result.runid : undefined,
    wait: event.result ? event.result.wait : undefined
  }

  var adfi = {
    key: null, 
    secret: null,
    dateRange: function() {
      return '&from=' + params.startDate + '&to=' + params.endDate;
    },
    getCount: function() {
      return request({
        url: LOGINS_API_URL + '/?take=1' + this.dateRange(),
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-AdFi-Access-Key' : this.key,
          'X-AdFi-Access-Secret' : this.secret
        }
      });      
    },
    getLogins: function(response) {
      let count = JSON.parse(response).stats.count;
      return request({
        url: LOGINS_API_URL + '/?take=' + count + this.dateRange(),
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-AdFi-Access-Key' : this.key,
          'X-AdFi-Access-Secret' : this.secret
        }
      });
    }
  }

  var aws = {
    getSecrets: function() {
       return new Promise(function(resolve, reject) {
        return ssm.getParametersByPath({
          Path: '/org/adfi/location/' + params.loc,
          Recursive: true,
          WithDecryption: true }).promise()
        .then(
          function(data) { 
            let parameters = data.Parameters;
            parameters.forEach(function(parameter){
              if (parameter.Name.includes('key'))
              adfi.key = parameter.Value;
              if (parameter.Name.includes('secret'))
              adfi.secret = parameter.Value;
            });
            resolve(); 
          });
        });
      },
      uuid: function() {
        let dt = new Date().getTime();
        let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            let r = (dt + Math.random()*16)%16 | 0;
            dt = Math.floor(dt/16);
            return (c=='x' ? r :(r&0x3|0x8)).toString(16);
        });
        return uuid;
      },
      storeLogins: function(response) {
        params.runid = params.runid ? params.runid : this.uuid();
        let key = LOGINS_KEY_PREFIX + '/' + params.loc + '/' +
          params.startDate.replace(/-/g , "/") + '/part-r0000-' + params.runid + '.json';
        let logins = JSON.parse(response).logins;
        return new Promise(function(resolve, reject) {
          return s3.putObject({
            Body: JSON.stringify(logins),
            Bucket: LOGINS_BUCKET,
            Key: key }).promise()
          .then(data => { resolve(logins); });
        });
      },
      putRunId: function(logins) {
        return dynamoDb.put({
          TableName: LOGINS_TABLE_NAME,
          Item: {
            "runid": params.runid,
            "loc": params.loc,
            "perfiles": logins.map(login => login.perfiles_id).join(',')
          }
        }).promise();
      }
    }

    aws.getSecrets()
      .then(adfi.getCount.bind(adfi))
      .then(adfi.getLogins.bind(adfi))
      .then(aws.storeLogins.bind(aws))
      .then(aws.putRunId.bind(aws))
      .then(function() {
        let wait = params.wait;
        if (!wait) {
          wait = moment();
          let dayDiff = moment().diff(moment(params.startDate), 'days');
          if (dayDiff < 15) {
            wait = moment().add((15 - dayDiff), 'days');  
          }
          wait = wait.format();
        }
        callback(null, {"wait": wait, "runid": params.runid});
      });
      
}