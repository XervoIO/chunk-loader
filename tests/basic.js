var express = require('express'),
    app = express(),
    chunkLoader = require(__dirname + '/../lib/chunk-loader'),
    uploader = chunkLoader.Client,
    server = chunkLoader.Server();

app.use(server.middleware( {
  saveDir: __dirname
}));

app.listen(8080);

server.on('complete', function(file) {
  console.log('Server complete: ' + file.tag.customProperty);
});

server.auth = function(file, callback) {
  callback();
};

var doUpload = function() {
  var client = uploader.uploadFile(
    __dirname + '/test-file.txt',
    {
      tag: { customProperty: 'customValue' },
      encrypted: true,
      beginHost: 'http://localhost:8080',
      uploadHost: 'http://localhost:8080'
    }
  );
  client.on('error', function(err) {
    console.log(err);
  });

  client.on('begin', function() {
    console.log('on begin')
  });

  client.on('complete', function() {
    console.log('complete');
  });

  client.on('progress', function(p) {
    console.log('progress:' + ((p.sent / p.total) * 100));
  });
};

setTimeout(doUpload, 1000);