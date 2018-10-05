const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.REGION });

const moment = require('moment');

exports.iterator = function(event, context, callback) {
  
  let startDate;
  let endDate;

  if (event.iterator) {
    
    startDate = moment(event.iterator.startDate).add(1, 'day');

    if (event.isBulk) {
      endDate = startDate.clone().add(1, 'day');
      let bulkEndDate = moment(event.bulkEndDate);

      if (endDate.diff(bulkEndDate, 'days') >= 1) {
        endDate = startDate;
      }

    }

  } else {

    startDate = moment().subtract(1, 'days');
    endDate = moment();

    if (event.isBulk) {
      startDate = moment(event.bulkStartDate);
      endDate = startDate.clone().add(1, 'day');
    }

  }

  callback(null, 
    {
     "continue": endDate.diff(startDate, 'days') > 0,
     "startDate": startDate.format('YYYY-MM-DD'), 
     "endDate": endDate.format('YYYY-MM-DD') 
    });

}