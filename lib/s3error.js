
module.exports = function(errorString){
  if(!errorString) return false;

  errorString +='';
  var err = new Error();
  err.xml= errorString;
  err.code = 'E_ERROR';
  if(errorString.indexOf('InvalidAccessKeyId') > -1) err.code = 'E_KEY_ERROR';
  else if(errorString.indexOf('NoSuchKey') > -1) err.code = 'E_NOENT';
  
  return err;
}



