var Protocol = require('bittorrent-protocol');
var net = require('net');
var ut_pex = require('ut_pex');
console.log("creating server");

net.createServer(function (socket) {
	console.log("inside server");
  var wire = new Protocol();
  socket.pipe(wire).pipe(socket);
 
  // initialize the extension 
  wire.use(ut_pex());
 
  // all `ut_pex` functionality can now be accessed at wire.ut_pex 
 
  // (optional) start sending peer information to remote peer 
  wire.ut_pex.start();
  console.log("init");
 
  // 'peer' event will fire for every new peer sent by the remote peer 
  wire.ut_pex.on('peer', function (peer) {
	console.log("got peer");
	console.log(peer);
    // got a peer 
    // probably add it to peer connections queue 
  });
 
  // handle handshake 
  wire.on('handshake', function (infoHash, peerId) {
	console.log("handshake");
	console.log(peerId);
    wire.handshake(new Buffer('B415C913643E5FF49FE37D304BBB5E6E11AD5101'), new Buffer('NT0-0-1--nqZzBQIOcrR'));
  });
 
}).listen(6881, function() { //'listening' listener
  console.log('server bound');
});