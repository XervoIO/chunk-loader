var util = require('util'),
    events = require('events'),
    async = require('async'),
    _ = require('underscore'),
    request = require('request'),
    encryptor = require('file-encryptor'),
    uuid = require('node-uuid'),
    path = require('path'),
    os = require('os'),
    fs = require('fs');

//--------------------------------------------------------------------------------------------------
var Client = function(filePath, options) {

  this.options = combineOptions(options);

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

    self.log("File Size: " + self.fileSize);

    self.beginUpload();
  });
};

util.inherits(Client, events.EventEmitter);

//--------------------------------------------------------------------------------------------------
Client.uploadFile = function(filePath, options) {

  return new Client(filePath, options);
};

//--------------------------------------------------------------------------------------------------
Client.prototype.beginUpload = function() {

  var self = this;

  this.emit('begin');

  var endpoint = util.format('%s/%s%s',
    self.options.beginHost,
    self.options.prefix,
    self.options.beginPath
  );

  var body = {
    tag: self.options.tag,
    encrypted: self.options.encrypted
  };

  self.log('Begin endpoint: ' + endpoint);

  request.post({
    uri: endpoint,
    body: JSON.stringify(body),
    'content-type' : 'application/json'
    },
    function(err, response, body) {
      if(err) {
        self.emit('error', err);
      }
      else if(!response) {
        self.emit('error', new Error('No response from server.'));
      }
      else if(response.statusCode == 200) {
        var result = JSON.parse(body);
        self.token = result.token;
        self.encryptionToken = result.encryptionToken;
        self.log('Token: ' + self.token);

        if(self.options.encrypted) {
          self.encrypt(self.filePath, function(err, file) {
            self.upload(file);
          });
        }
        else {
          self.upload(self.filePath);
        }
      }
      else if(response.statusCode == 401) {
        self.emit('error', new Error('Not authorized to upload files.'));
      }
    }
  );
};

//--------------------------------------------------------------------------------------------------
Client.prototype.encrypt = function(file, callback) {

  var self = this;

  this.log('Encrypting file.');

  var tempFile = path.join(os.tmpDir(), uuid.v4() +'.encrypted');
  encryptor.encryptFile(file, tempFile, self.encryptionToken, function() {
    fs.stat(tempFile, function(err, stats) {
      self.fileSize = stats.size;
      self.log("Encrypted File Size: " + self.fileSize);
    });
    self.log('Encryption complete: ' + tempFile)
    callback(null, tempFile);
  });
};

//--------------------------------------------------------------------------------------------------
Client.prototype.upload = function(file) {

  var self = this;
  var tries = 0;
  var fileDescriptor = null;

  fs.open(file, 'r', function(err, fd) {
    fileDescriptor = fd;
    if(err) {
      self.emit('error', err);
    }
    else {
      uploadChunk();
    }
  });

  var uploadChunk = function() {

    var buf = new Buffer(self.options.chunkSize);

    fs.read(fileDescriptor, buf, 0, self.options.chunkSize, this.bytesSent, function(err, bytesRead, buffer) {

      self.log('Bytes Read: ' + bytesRead);

      var endpoint = util.format('%s/%s%s?token=%s&offset=%s&length=%s&complete=%s',
        self.options.uploadHost,
        self.options.prefix,
        self.options.uploadPath,
        self.token,
        self.bytesSent,
        bytesRead,
        bytesRead < self.options.chunkSize
      );

      self.log('Upload endpoint: ' + endpoint);


      request.post({
          url: endpoint,
          body: buffer.slice(0, bytesRead),
          'Content-type' : 'application/octet-stream'
        },
        function(err, response, body) {

          var retry = false;

          if(err) {
            self.log('Request failed. ' + err);
            retry = true;
          }
          else if(!response) {
            self.log('Request failed. Undefined response.');
            retry = true;
          }
          else if(response.statusCode == 200) {
            tries = 0;
            self.bytesSent += bytesRead;
            self.log('Total sent: ' + self.bytesSent);
            self.emit('progress', { total: self.fileSize, sent: self.bytesSent });

            if(bytesRead < self.options.chunkSize) {
              self.log('Upload complete.');
              self.emit('complete', this);
              fs.close(fileDescriptor);
              if(self.options.encrypted) {
                fs.unlink(file);
              }
            }
            else {
              uploadChunk();
            }
          }
          else if(response.statusCode == 400) {
            this.emit('error', new Error('Token not found by server. Upload not properly started.'))
          }
          else {
            self.log('Request failed. Unexpected status code.');
            retry = true;
          }

          if(retry) {
            tries++;
            if(tries > self.options.retryLimit) {
              emit('error', new Error('Failed to sent chunk after ' + self.options.retryLimit + ' tries.'));
            }
            else {
              setTimeout(uploadChunk, 500);
            }
          }
        }
      );
    });
  };
};

//--------------------------------------------------------------------------------------------------
Client.prototype.log = function(message) {
  if(this.options.debug) {
    console.log('CLIENT DEBUG: ' + message);
  }
};

//--------------------------------------------------------------------------------------------------
var defaultOptions = {
  chunkSize: 65536,
  beginHost: 'http://localhost:80',
  uploadHost: 'http://localhost:80',
  uploadPath: '/upload',
  beginPath: '/beginUpload',
  debug: true,
  retryLimit: 100,
  encrypted: false,
  prefix: 'cec8f4b41fad4dea97aa029ac6511f9f',
  tag: null
};

//--------------------------------------------------------------------------------------------------
var combineOptions = function(options) {

  var returnVal = {};
  for(var key in defaultOptions) {
    if(_.isUndefined(options[key])) {
      returnVal[key] = defaultOptions[key];
    }
    else {
      returnVal[key] = options[key];
    }
  }

  return returnVal;
};

module.exports = Client;