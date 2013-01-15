var util = require('util'),
    events = require('events'),
    async = require('async'),
    _ = require('underscore'),
    request = require('request'),
    fs = require('fs');

//--------------------------------------------------------------------------------------------------
var Client = function(filePath, options) {

  this.options = combineOptions(options);

  this.log(this.options);

  var self = this;

  this.log('Filepath: ' + filePath);

  fs.stat(filePath, function(err, stats) {
    if(err) {
      return self.emit('error', err);
    }

    if(!stats.isFile()) {
      return self.emit('error', new Error('Object is not a file.'));
    }

    self.fileSize = stats.size;
    self.filePath = filePath;
    self.bytesSent = 0;

    self.beginUpload();
  });
};

util.inherits(Client, events.EventEmitter);

//--------------------------------------------------------------------------------------------------
Client.uploadFile = function(filePath, options, callback) {

  if(_.isFunction(options)) {
    callback = options;
  };

  if(_.isUndefined(callback)) {
    callback = function() {};
  };

  callback(null, new Client(filePath, options));
};

//--------------------------------------------------------------------------------------------------
Client.prototype.beginUpload = function() {

  var self = this;

  this.emit('begin');

  try {
    fs.open(this.filePath, 'r', function(err, fd) {
      if(err) {
        self.emit('error', err);
      }
      else {

        var endpoint = util.format('%s://%s:%s/%s%s',
          self.options.protocol,
          self.options.host,
          self.options.port,
          self.options.prefix,
          self.options.beginPath);

        var body = {
          path: self.filePath,
          size: self.fileSize,
          tag: self.options.tag
        };

        self.log('Being endpoint: ' + endpoint);

        request.post({
          uri: endpoint,
          body: JSON.stringify(body),
          'content-type' : 'application/json'
        },
        function(err, response, body) {
          if(err) {
            self.emit('error', err);
          }
          else if(response.statusCode == 200) {
            self.token = JSON.parse(body).token;
            self.log('Token: ' + self.token);
            self.upload(fd);
          }
          else if(response.statusCode == 401) {
            self.emit('error', new Error('Not authorized to upload files.'));
          }
        });
      }
    });
  }
  catch(ex) {
    self.emit('error', new Error(ex.message));
  }

};

//--------------------------------------------------------------------------------------------------
Client.prototype.upload = function(fd) {

  this.log(fd);

  var self = this;
  var endpoint = this.options.protocol + '://' + this.options.host + ':' + this.options.port + this.options.uploadPath + '?token=' + self.token;

  var tries = 0;

  var uploadChunk = function() {

    var toRead = Math.min(self.options.chunkSize, self.fileSize - self.bytesSent);
    self.log('To Read: ' + toRead);

    var endpoint = util.format('%s://%s:%s/%s%s?token=%s&offset=%s&length=%s',
      self.options.protocol,
      self.options.host,
      self.options.port,
      self.options.prefix,
      self.options.uploadPath,
      self.token,
      self.bytesSent,
      toRead);

    self.log('Upload endpoint: ' + endpoint);

    var buf = new Buffer(toRead);

    if(toRead === 0) {
      self.emit('complete');
      return;
    }

    fs.read(fd, buf, 0, toRead, this.bytesSent, function(err, bytesRead, buffer) {
      request.post({
          url: endpoint,
          body: buffer,
          headers: { 'content-size' : toRead },
          'Content-type' : 'application/octet-stream'
        },
        function(err, response, body) {
          if(response.statusCode == 200) {
            tries = 0;
            self.bytesSent += bytesRead;
            self.log('Total sent: ' + self.bytesSent);
            this.emit('progress', { total: self.fileSize, sent: self.bytesSent });
            uploadChunk();
          }
          else if(response.statusCode == 400) {
            this.emit('error', new Error('Token not found by server. Upload not properly started.'))
          }
          else {
            tries++;
            if(tries > self.options.retryLimit) {
              emit('error', new Error('Failed to sent chunk after ' + self.options.retryLimit + ' tries.'));
            }
            else {
              self.log(response.statusCode);
              setTimeout(uploadChunk, 500);
            }
          }
        }
      );
    });
  };

  uploadChunk();
};

//--------------------------------------------------------------------------------------------------
Client.prototype.log = function(message) {
  if(this.options.debug) {
    console.log(message);
  }
};

//--------------------------------------------------------------------------------------------------
var defaultOptions = {
  chunkSize: 4096,
  protocol: 'http',
  host: 'localhost',
  port: '8080',
  uploadPath: '/upload',
  beginPath: '/beginUpload',
  debug: true,
  retryLimit: 100,
  prefix: 'cec8f4b41fad4dea97aa029ac6511f9f',
  tag: null
};

//--------------------------------------------------------------------------------------------------
var combineOptions = function(options) {

  var returnVal = {};
  for(var key in defaultOptions) {
    returnVal[key] = options[key] || defaultOptions[key];
  }

  return returnVal;
};

module.exports = Client;