const AWS = require('aws-sdk');

const HOTSPOTS_API_URL = process.env.HOTSPOTS_API_URL;
const HOTSPOTS_BUCKET = process.env.HOTSPOTS_BUCKET;
const HOTSPOTS_KEY_PREFIX = process.env.HOTSPOTS_KEY_PREFIX;

AWS.config.update({ region: process.env.REGION });

const request = require('request-promise');

const s3 = new AWS.S3();
const ssm = new AWS.SSM();

exports.handler = (event, context, callback) => {

  var params = {
    loc: event.iterator.loc,
    startDate: event.dates.start,
    runid: event.result.runid
  }

  var adfi = {
    key: null, 
    secret: null,
    getCount: function() {
      return request({
        url: HOTSPOTS_API_URL + '/?take=1',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-AdFi-Access-Key' : this.key,
          'X-AdFi-Access-Secret' : this.secret
        }
      });      
    },
    getHotspots: function(response) {
      let count = JSON.parse(response).stats.count;
      return request({
        url: HOTSPOTS_API_URL + '/?take=' + count,
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
      storeHotspots: function(response) {
        let key = HOTSPOTS_KEY_PREFIX + '/' + params.loc + '/' + 
          params.startDate.replace(/-/g , "/") + '/part-r-0000-' + params.runid + '.json';
        let hotspots = JSON.parse(response).hotspots;
        return s3.putObject({
          Body: JSON.stringify(hotspots),
          Bucket: HOTSPOTS_BUCKET,
          Key: key }).promise();
      }
    }

    aws.getSecrets()
      .then(adfi.getCount.bind(adfi))
      .then(adfi.getHotspots.bind(adfi))
      .then(aws.storeHotspots.bind(aws))
      .then(() => context.succeed());
      
}