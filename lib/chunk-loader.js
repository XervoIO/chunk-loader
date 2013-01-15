var client = require('./client'),
  server = require('./server');

var ChunkLoader = {};

ChunkLoader.Client = client;
ChunkLoader.Server = server;

module.exports = ChunkLoader;