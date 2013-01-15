var express = require('express'),
    app = express(),
    chunkLoader = require(__dirname + '/../lib/chunk-loader'),
    uploader = chunkLoader.Client,
    server = chunkLoader.Server(app);

app.listen(8080);

server.on('complete', function(file) {
  console.log('Server complete: ' + file.tag.projectId);
});

server.auth = function(file, callback) {
  callback();
};

setTimeout(function() {
  var client = uploader.uploadFile(__dirname + '/test-file.txt', { tag: { projectId: '4563' }});
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
}, 1000);