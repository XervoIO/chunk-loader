chunk-loader
============

Utility for sending files from a Node.js client to an [Express](http://expressjs.com) server. Files are split into
individual chunks and posted separately. Any failed chunk is automatically retried. Great for large files
that are uploaded over inconsistent network connections. Built-in support for file encryption.

## Installation
    npm install chunk-loader

## Client

    var client = require('chunk-loader).Client;

    var upload = client.uploadFile('../path/to/file.txt', /* options */);

    upload.on('progress', function(p) {
      console.log('Progress:' + ((p.sent / p.total) * 100) + '%');
    });

    upload.on('complete', function() {
      console.log('Done!');
    });

    upload.on('error', function(err) {
      console.log('Upload error has occurred.');
    });

### Options

* `chunkSize`: defaults to `65536`. The size of each individual chunk sent to the server.
* `beginHost`: defaults to `http://localhost:80`. The full host url used for the begin upload request.
The `tag` option can be used to pass identifying information, in which case you may want this request to
go over https while the file upload goes over http.
* `uploadHost`: defaults to `http://localhost:80`. The url where uploaded chunks are sent.
* `retryLimit`: defaults to `100`. The number of time a failed chunk will retry.
* `encrypted`: defaults to `false`. Whether or not to encrypt the file before sending. Files are
encrypted using the [file-encryptor](https://github.com/onmodulus/file-encryptor) module. Unique
encryption keys are automatically generated and supplied by the server for every file.
* `debug`: defaults to `false`. Enables debug console logging when troubleshooting upload issues.
* `tag`: defaults to `null`. Any custom data that should be sent to the server as part of the upload.
This will typically be used to identify the image. Can also be used to supply credentials for
server-side authentication.


## Server
The server is designed to integrate into an existing Express application.

    var express = require('express'),
        app = express(),
        server = require('chunk-loader').Server();

    app.use(server.middleware(/* options */));

    // Important! If you use bodyParser, chunk-loader must be applied first.
    // app.use(express.bodyParser());

    server.on('complete', function(file) {
      console.log(file.savePath);
    });

### Options

* `saveDir`: defaults to `os.tmpDir()`. Folder where uploaded files will be saved. Files will
receive an automatically generated name.
* `debug`: defaults to `false`. Enables debug console logging when troubleshooting upload issues.

### Server Authentication
The auth function can be overridden to prevent uploads based on custom criteria. If the callback is
invoked with an error parameter, the upload will be cancelled. The tag property is custom data set
by the chunk-loader client. It can be any arbitrary data.

    server.auth = function(file, callback) {
      if(file.tag.username !== 'username' && file.tag.password !== 'password') {
        return callback(new Error('Invalid creds.');
      }
      callback();
    };