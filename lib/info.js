var AWS = require('aws-sdk');
var s3error = require('./s3error');
var log = require('./log');

// returns the whole json doc for package
module.exports = function(config,s3packagename,cb){
  AWS.config.update({
      region: 'us-east-1',
      accessKeyId: config.key,
      secretAccessKey: config.secret
  });

  // bucket/module
  if(!s3packagename) return cb(new Error('package name require'));

  var parts = (s3packagename||'').split('/')
  if(parts.length == 1){
    log('warn','package.json did not define an s3bucket using default ',config.defaultBucket);
    parts.unshift(config.defaultBucket);
  }

  var bucket = parts.shift();
  var module = parts.join('/');
  var calledback = false;

  var sts = new AWS.STS();
  var roleparams = {
      RoleArn: "arn:aws:iam::663444553425:role/Serverless_Delegation",
      RoleSessionName: "Serverless_Delegation"
  };
  sts.assumeRole(roleparams, function(err, data) {
      if (err) {
          console.log("assume role err:"+err);
          console.log(err, err.stack);
      } else {
          AWS.config.update({
              region: 'us-east-1',
              accessKeyId: data.Credentials.AccessKeyId,
              secretAccessKey: data.Credentials.SecretAccessKey,
              sessionToken: data.Credentials.SessionToken
          });

          var s3 = new AWS.S3();

          var params = {
              Bucket: bucket,
              Key: module+'.json',
          };
          s3.getObject(params, function(err, data) {
              var json = null;
              if(data) {
                  json = JSON.parse(data.Body.toString('utf-8'));
              }
              cb(s3error(err),json);
          });


      }
  });

}
