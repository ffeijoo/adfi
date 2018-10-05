const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.REGION });

const ssm = new AWS.SSM();

exports.iterator = function(event, context, callback) {
  
  let locations = new Array();
  let index = 0;

  if (event.iterator) {
    
    locations = JSON.parse(event.iterator.locs);
    index = event.iterator.index;

    index += 1;

    callback(null, {
      "locs": JSON.stringify(locations),
      "loc": locations[index] != undefined ? locations[index] : '', 
      "index": index,
      "continue": locations[index] != undefined
    });

  } else {

    let prefix = '/org/adfi/location/';

    let params = {
      Path: prefix,
      Recursive: true,
      WithDecryption: true
    };
    
    ssm.getParametersByPath(params, function(err, data) {
      
      if (err) {
        context.fail("Could not retrieve parameters" + err);
        callback(err);
      }

      let parameters = data.Parameters;
      parameters.forEach(function(parameter){
        
        let loc = parameter.Name;
        let i = loc.indexOf(prefix);
       
        if (i >= 0) {
          loc = loc.substring(i + prefix.length);
        }
        i = loc.indexOf('/');
        if (i >= 0) {
          loc = loc.substring(0, i);
        }

        if (locations.indexOf(loc) == -1) locations.push(loc);

      });

      callback(null, {
        "locs": JSON.stringify(locations),
        "loc": locations[index],
        "index": index,
        "continue": true
      });

    }); 

  }

}