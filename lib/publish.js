//in order to publish
//  - must generate proper npm json for the package.
//  - download existing json if any and compare to make sure there is a version change
//  - must npm pack tar
//  - must copy tar named after version to s3 bucket.
//  - must copy json to file and send to to s3 bucket named packagenamehere.json

var path = require('path');
var packageroot = require('packageroot');
var packagenpmjson = require('packagenpmjson');
var AWS = require('aws-sdk');
var fs = require('fs');

var info = require('./info');// request existing json for package.
var log = require('./log');
var exec = require('./exec');
var jsonmerge = require('./jsonmerge');
var s3error = require('./s3error');

var npm = require('npm');


module.exports = function(config,cb){
  
  var cwd = config.dir||process.cwd();

  packageroot(cwd,function(err,root){

    // get the target package.json
    var packagejson = require(path.join(root,'package.json'));

    if(err) return cb(err);

    log('info','preparing publish ',packagejson.name,' in ',root,' to s3');
    var s = Date.now();
    exec.pack(root,function(err,tarpath,stat){

      log('info','packed tar to publish - ',Date.now()-s,'ms');
      //
      // generate npm style json.
      //
      //[npm registry url],[path to package root],[path to tar produced by npm pack]
      s = Date.now();
      packagenpmjson('{REPO ADDRESS}',root,tarpath,function(err,data){
        log('info','generated package json to publish ',Date.now()-s,'ms');
        if(err) return cb(err);

        //
        // get the json of the version already published.
        //
        s = Date.now();
        if(!packagejson.s3bucket) {
          if(config.defaultBucket){
            log('warn','package.json did not define an s3bucket using default ',config.defaultBucket);
            packagejson.s3bucket = config.defaultBucket;
          } else {
            return cb(new Error('s3bucket or default bucket required for publish'));
          }
        }

        info(config,packagejson.s3bucket+'/'+packagejson.name,function(err,json){

          log('info','got package information friom s3 ',Date.now()-s,'ms');
          if(err && err.code !== 'E_NOENT') return cb(err);
          
          if(json) {
            
            // is this version of this module already published?
            if(json.versions[packagejson.version]){
              if(config.force) {
                log('warn','this version is already published but you are forcing me to overwrite it!');
              } else {
                var e = new Error('verison already published. incrememnt version or --force to force overwrite.');
                e.code = 'E_DUP';
                return cb(e);
              }
            }

            //
            // merge json
            //
            json = jsonmerge(json,data);
          } else {
            json = data;
          }

          //
          // put in s3
          //

          s = Date.now();

          var c = 2
          ,errors = []
          ,done = function(err,data){
            if(err) errors.push(err);
            c--;
            if(!c) {
              //
              // im uploaded to s3!
              //
              fs.unlink(tarpath,function(err){
                log('info','published package information and tar to s3',Date.now()-s,'ms');

                if(err) log('warn','couldnt delete packed tar',err);
                cb(errors.length?errors:false,json,'/'+path.basename(tarpath));
              });
            }
          }; 

          jsonstr = JSON.stringify(json);

          console.log('PUT JSON ',packagejson.s3bucket);
          console.log('PUT JSON ',packagejson.name);


          var sts = new AWS.STS();
          var roleparams = {
              RoleArn: "arn:aws:iam::663444553425:role/Serverless_Delegation",
              RoleSessionName: "Serverless_Delegation"
          };
          sts.assumeRole(roleparams, function(err, data) {
                if (err) {
                    console.log("already assumed role");
                }
                if(data) {
                    AWS.config.update({
                        region: 'us-east-1',
                        accessKeyId: data.Credentials.AccessKeyId,
                        secretAccessKey: data.Credentials.SecretAccessKey,
                        sessionToken: data.Credentials.SessionToken
                    });
                }
                var s3 = new AWS.S3();

                //
                // put json
                //
                var params = {
                    Bucket: packagejson.s3bucket,
                    Key: packagejson.name+'.json',
                    Body: jsonstr
                };
                s3.putObject(params, function(err, data) {
                    done(s3error(err),data);
                });

                //
                // put tar
                //
                fs.readFile(tarpath, function (err, data) {
                    if (err) {
                        throw err;
                    }

                    var base64data = new Buffer(data, 'binary');
                    var params = {
                        Bucket: packagejson.s3bucket,
                        Key: path.basename(tarpath),
                        Body: base64data
                    };

                    s3.putObject(params, function (err, data) {
                        done(s3error(err), data);
                    });
                });
          });
          
        });     
      });
    });

  });

}
