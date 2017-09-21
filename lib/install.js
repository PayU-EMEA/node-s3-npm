var path = require('path');
var npm = require('npm');
var packageroot = require('packageroot');
var log = require('./log');
var server = require('./server')

module.exports = function(config,module,cb){

  packageroot(config.dir||process.cwd(),function(err,root){
    if(err) return cb(err);

    var deps;
    var proxyserver;
    var s = Date.now();
    var package = require(path.join(root,'package.json'));

    if(package[config.dependenciesKey]) {
      deps = package[config.dependenciesKey];
    } else {
      deps = package[package.s3dependencies ? 's3dependencies' : 's3Dependencies'];
    }

    if(Object.keys(deps || {}).length === 0 && !module) {
      return cb(null);
    }

    proxyserver = server(config,function(err,address){

      if(err) return cb(err);

      address = 'http://'+address.address+':'+address.port;

      log('info','npm proxy server running on ',address,Date.now()-s,'ms');

      s = Date.now();
      npm.load({'registry': address,'strict-ssl':false}, function (err) {

        log('info','npm loaded',Date.now()-s,'ms');

        if(module) {
          log('info','installing specific module ',module);

          deps = [module+'@latest'];

        } else if(!(deps instanceof Array)) {
          var _deps = [];
          Object.keys(deps).forEach(function(name,k){
              var version = deps[name];
              if(name.indexOf('/') === -1){

                if(config.defaultBucket) {
                  //prepend default bucket
                  name = config.defaultBucket+'/'+name
                  log('info','adding default bucket to module name ',name);

                } else {
                  log('warn','No bucket on module name and no default bucket in config. I probably wont be able to find your module',name);
                }
              }
              _deps.push(name+'@'+version);
          });
          deps = _deps;

          log('info','installing package deps ',deps);
        }

        s = Date.now();
        npm.commands.install(deps, function (err, data) {

          proxyserver.close();

          log('info','install finished ',Date.now()-s,'ms');

          cb(err,data);
        });

      });

    });
  });
}

