var fs = require('fs'),
    os = require('os'),
    path = require('path'),
    util = require('util'),
    events = require('events'),
    uuid = require('node-uuid');

var prefix = 'cec8f4b41fad4dea97aa029ac6511f9f';

//--------------------------------------------------------------------------------------------------
var ServerFactory = function(app, options) {
  return new Server(app, options);
};

//--------------------------------------------------------------------------------------------------
var Server = function(app, options) {

  this.options = {
    debug: true
  }

  this.files = {};

  var self = this;

  app.post('/' + prefix + '/beginUpload', function(req, res) { self.beginFile(req, res); });
  app.post('/' + prefix + '/upload', function(req, res) { self.handleChunk(req, res); });
};

util.inherits(Server, events.EventEmitter);

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
    self.savePath = path.join(os.tmpDir(), uuid.v4());
    self.log('Output path: ' + self.savePath);

    self.emit('begin', self);

    var file = new File();
    file.savePath = self.savePath;
    file.clientPath = req.body.path;
    file.size = req.body.size;
    file.tag = req.body.tag;
    self.files[file.token] = file;

    file.on('complete', function() {
      self.emit('complete', file);
    });

    self.auth(file, function(err) {
      if(!err) {
        res.send({ token : file.token });
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

  var token = req.query['token'];
  var offset = parseInt(req.query['offset'], 10);
  var length = parseInt(req.query['length'], 10);
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
    file.writeChunk(buf, offset, length, function(err, result) {
      res.send(200);
    });
  });
};

Server.prototype.log = function(message) {
  if(this.options.debug) {
    console.log(message);
  }
}

//--------------------------------------------------------------------------------------------------
var File = function() {
  this.clientPath = '';
  this.size = 0;
  this.token = uuid.v4();
  this.savePath = '';
  this.bytesWritten = 0;
};

util.inherits(File, events.EventEmitter);

//--------------------------------------------------------------------------------------------------
File.prototype.writeChunk = function(chunk, offset, length, callback) {

  var self = this;

  fs.open(this.savePath, 'a', function(err, fd) {
    fs.write(fd, chunk, 0, length, offset, function(err, written, buffer) {
      self.bytesWritten += written;
      if(self.bytesWritten) {
        self.emit('complete');
      }
      fs.close(fd);
      callback(err);
    });
  });
};

module.exports = ServerFactory;