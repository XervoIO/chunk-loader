var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    util = require('util'),
    events = require('events'),
    encryptor = require('file-encryptor'),
    uuid = require('node-uuid');

var prefix = 'cec8f4b41fad4dea97aa029ac6511f9f';

//--------------------------------------------------------------------------------------------------
var ServerFactory = function(options) {
  return new Server(options);
};

//--------------------------------------------------------------------------------------------------
var Server = function(options) {
  this.files = {};
};

util.inherits(Server, events.EventEmitter);

//--------------------------------------------------------------------------------------------------
Server.prototype.middleware = function(options) {

  this.options = Server.combineOptions(options);

  var self = this;

  return function(req, res, next) {
    if(req.url.indexOf('/' + prefix + '/beginUpload') >= 0) {
      self.beginFile(req, res);
    }
    else if(req.url.indexOf('/' + prefix + '/upload') >= 0) {
      self.handleChunk(req, res);
    }
    else {
      next();
    }
  }
};

//--------------------------------------------------------------------------------------------------
Server.prototype.beginFile = function(req, res) {

  var self = this;

  req.setEncoding('utf-8');
  req.body = '';

  req.on('data', function(data) {
    req.body += data;
  });

  req.on('end', function() {
    req.body = JSON.parse(req.body);
    self.savePath = path.join(self.options.saveDir, uuid.v4());
    self.log('Output path: ' + self.savePath);

    self.emit('begin', self);

    var file = new File();
    file.savePath = self.savePath;
    file.tag = req.body.tag;
    file.encrypted = req.body.encrypted;
    self.files[file.token] = file;

    file.on('complete', function() {
      self.emit('complete', file);
    });

    self.auth(file, function(err) {
      if(!err) {
        res.send({ token : file.token, encryptionToken: file.encryptionToken });
      }
      else {
        res.send(401);
      }
    });
  });
};

//--------------------------------------------------------------------------------------------------
Server.prototype.auth = function(file, callback) {
  callback();
};

//--------------------------------------------------------------------------------------------------
Server.prototype.handleChunk = function(req, res) {

  var self = this;

  var token = req.query['token'];
  var offset = parseInt(req.query['offset'], 10);
  var length = parseInt(req.query['length'], 10);
  var complete = req.query['complete'] === 'true';
  var file = this.files[token];

  if(!file) {
    res.send(400);
    return;
  }

  var buf = new Buffer(length);
  var bytesReceived = 0;

  req.on('data', function(data) {
    data.copy(buf, bytesReceived);
    bytesReceived += data.length;
  });

  req.on('end', function() {
    self.log(util.format('File chunk received. Offset: %s Length: %s', offset, length));
    file.writeChunk(buf, offset, length, function(err, result) {
      res.send(200);
      if(complete) {
        self.decrypt(file, function() {
          self.emit('complete', file);
        });
      }
    });
  });
};

//--------------------------------------------------------------------------------------------------
Server.prototype.decrypt = function(file, callback) {

  var self = this;

  if(file.encrypted) {
    var tempFile = path.join(os.tmpDir(), uuid.v4());
    self.log('Decrypting file.');
    encryptor.decryptFile(file.savePath, tempFile, file.encryptionToken, function() {
      self.log('Decryption complete.');
      fs.unlink(file.savePath, function() {
        fs.rename(tempFile, file.savePath, function() {
          callback();
        });
      });
    });
  }
  else {
    callback();
  }
};

//--------------------------------------------------------------------------------------------------
Server.prototype.log = function(message) {
  if(this.options.debug) {
    console.log('SERVER DEBUG: ' + message);
  }
}

//--------------------------------------------------------------------------------------------------
var File = function() {
  this.token = uuid.v4();
  this.encryptionToken = uuid.v4();
  this.savePath = '';
  this.bytesWritten = 0;
  this.encrypted = false;
};

util.inherits(File, events.EventEmitter);

//--------------------------------------------------------------------------------------------------
File.prototype.writeChunk = function(chunk, offset, length, callback) {

  var self = this;

  fs.open(this.savePath, 'a', function(err, fd) {
    fs.write(fd, chunk, 0, length, offset, function(err, written, buffer) {
      self.bytesWritten += written;
      fs.close(fd);
      callback(err);
    });
  });
};

//--------------------------------------------------------------------------------------------------
Server.defaultOptions = {
  debug: false,
  saveDir: os.tmpDir()
};

//--------------------------------------------------------------------------------------------------
Server.combineOptions = function(options) {
  var result = {};
  for(var key in File.defaultOptions) {
    result[key] = File.defaultOptions[key];
  }

  for(var key in options) {
    result[key] = options[key];
  }

  return result;
};

module.exports = ServerFactory;