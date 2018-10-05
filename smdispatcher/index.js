const AWS = require('aws-sdk')

AWS.config.update({ region: process.env.REGION });

const LOCATION_STEP_FUNCTIONS_ARN = process.env.LOCATION_STEP_FUNCTIONS_ARN;

const stepfunctions = new AWS.StepFunctions();

exports.handler = (event, context, callback) => {
 
  var params = {
    stateMachineArn: LOCATION_STEP_FUNCTIONS_ARN,
    input: JSON.stringify(
      {
        'dates' :  { 
          'start': event.iterator.startDate, 
          'end': event.iterator.endDate 
        }
      }
    )
  }
  
  stepfunctions.startExecution(params, function (err, data) {
    if (err) {
      console.log('err while executing step function');
    } else {
      console.log('started execution of step function');
    }
  });

}