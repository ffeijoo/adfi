const AWS = require('aws-sdk');

const FBLIKES_API_URL = process.env.FBLIKES_API_URL;
const FBLIKES_BUCKET = process.env.FBLIKES_BUCKET;
const FBLIKES_KEY_PREFIX = process.env.FBLIKES_KEY_PREFIX;

AWS.config.update({ region: process.env.REGION });

const request = require('request-promise');

const s3 = new AWS.S3();
const ssm = new AWS.SSM();

exports.handler = (event, context, callback) => {

  var params = {
    loc: event.iterator.loc,
    startDate: event.dates.start, 
    endDate: event.dates.end,
    runid: event.result.runid
  }

  var adfi = {
    key: null, 
    secret: null,
    dateRange: function() {
      return '&from=' + params.startDate + '&to=' + params.endDate;
    },    
    getCount: function() {
      return request({
        url: FBLIKES_API_URL + '/?take=1' + this.dateRange(),
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-AdFi-Access-Key' : this.key,
          'X-AdFi-Access-Secret' : this.secret
        }
      });      
    },
    getFblikes: function(take, skip) {
      return request({
        url: FBLIKES_API_URL + '/?take=' + take + '&skip=' + skip + this.dateRange(),
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
      pad: function(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
      },
      storeFblikes: function(response, index) {
        let key = FBLIKES_KEY_PREFIX + '/' + params.loc + '/' +
          params.startDate.replace(/-/g , "/") + '/part-r-' + this.pad(index,4) + '-' + params.runid + '.json';
        let likes = JSON.parse(response).likes;
        return s3.putObject({
          Body: JSON.stringify(likes),
          Bucket: FBLIKES_BUCKET,
          Key: key }).promise();
      }
    }

    aws.getSecrets()
      .then(adfi.getCount.bind(adfi))
      .then(function(response) {
        let count = JSON.parse(response).stats.count;
        let takes = new Array(
          Math.floor(count / 5000)).fill(5000).concat(count % 5000);  
        let promises = takes.map(function(take, index) {
          let skip = 5000 * index;
          return adfi.getFblikes(take, skip).promise();
        });

        Promise.all(promises).then((responses) => { 
          responses.forEach((response, index) => 
            aws.storeFblikes(response, index).then( 
              () => (promises.length - index) === 1 ? context.succeed() : '' ));
          }
        );

      });
}
