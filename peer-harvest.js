//@author: Stefan.github@gmail.com
//require filesystem stuff
var fs = require("fs");
//util for formatting strings
var util = require("util");
//winston for logging
var winston = require('winston');
//torrent libraries
var DHT = require('bittorrent-dht');
var magnet = require('magnet-uri');
var Client = require('bittorrent-tracker');
var parseTorrent = require('parse-torrent');
var Swarm = require('bittorrent-swarm');
var ut_pex = require('ut_pex'); //PEX
var pex_active = false;
//Hashmap for storing ips
var HashMap = require('hashmap');
//string utility functions
require('string.prototype.endswith');
require('string.prototype.startswith');
//contains all the gathered IP adresses
var ip_hashmap = new HashMap();
//contains all the trackers we will query
var trackers = [];
// winston.level = 'debug';
//enable some color magic with winston
winston.cli();
//this check is to make sure not all means of gathering IP addresses are disabled and that in general no conflicting options are set!
var disable_check = function disable_check(argv, b) {
    var failures = [];
    if (argv.disableDht && argv.disableTrackers) {
        winston.error("Can't disable DHT AND Trackers. Only one is possible.'");
        failures.push("Failure! You can't disable both DHT and Trackers. Choose one.");
    }
    if (argv.overwrite && argv.append) {
        winston.error("Can't enable --overwrite and --append. Only one is possible.'");
        failures.push("Failure! You can't overwrite AND append to the output file. Choose one.");
    }
    if (failures.length !== 0) {
        return failures.join("\n");
    } else {
        return true;
    }
};
//setup arguments parser
var argv = require('yargs')
    .usage('Usage: node peer-harvest.js -o peers.txt some.torrent | INFO_HASH | magnet:url')
    .alias('v', 'verbosity')
    .default('v', 2)
    .describe("v", "output verbosity. 0: errors, 1:warnings, 2:info, 3:debug")
    .boolean('disable-dht')
    .describe('disable-dht', 'Disable DHT and use Trackers only')
    .boolean('disable-trackers')
    .describe('disable-trackers', 'Disable Trackers and use DHT only')
    .boolean('disable-pex')
    .describe('disable-pex', 'Disable Peer Exchange')
    .boolean('print-peers')
    .describe('print-peers', "sends all peers to stdout - useful with the --silent option to parse output")
    .boolean('s')
    .alias('s', 'silent')
    .describe('s', "supress any unnecessary output")
    .alias('o', 'out-file')
    .default('o', 'peers.txt')
    .describe('o', 'Specify the file IPs will get written to')
    .default('dht-port', 20000)
    .describe('dht-port', 'The Port to be used for DHT')
    .default('max-connections', 2000)
    .describe('max-connections', 'Max. number of connections for PEX')
    .alias('t', 'timeout')
    .default('t', 420)
    .describe('t', 'The timout in seconds after the program terminates and stops looking for new Peers. Set to \'0\' (zero) to disable.')
    .default('timeout-no-peers', 30)
    .describe('timeout-no-peers', 'Time after which the program terminates once no new peers have been found. Takes no effect until a peer is found (use --timeout for instead). Set to \'0\' (zero) to disable.')
    .alias('p', 'torrent-port')
    .default('p', 6881)
    .describe('p', "The Port we are listening on for Bittorrent connections")
    .alias('l', 'trackers')
    .describe('l', "A comma seperated list of trackers to query")
    .default('l', "udp://open.demonii.com:1337,udp://tracker.coppersurfer.tk:6969")
    .boolean("overwrite")
    .describe("overwrite", "Overwrite output file if it already exists")
    .boolean("append")
    .describe("append", "Append to the output file if it already exists - CAREFUL: This may lead to duplicates in the output file!")
    .boolean("disable-out-file")
    .describe("disable-out-file", "Disables output to file. Useful together with --print-peers.")
    .boolean("disable-tracker-parsing")
    .describe("disable-tracker-parsing", "Disables looking for trackers in the torrent file or magnet link. Only uses those provided in --trackers")
    .demand(1) //demands one positional argument
    .help('h')
    .alias('h', 'help')
    .epilog("by stefan.github@gmail.com")
    .string('_') //TODO: what the heck does this do again??
    .check(disable_check)
    .argv;
//setup logging verbosity
if (argv.v <= 0) {
    winston.level = 'error';
}
if (argv.v == 1) {
    winston.level = 'warn';
}
if (argv.v == 2) {
    winston.level = 'info';
}
if (argv.v >= 3) {
    winston.level = 'debug';
}
if (argv.silent) {
    winston.remove(winston.transports.Console);

}
winston.debug("initialized.");
winston.debug(util.format("winston level is %s"), winston.level);

var argv_trackers = argv.trackers.split(","); // convert the tracker string of trackers from the arguments to an array
trackers = trackers.concat(argv_trackers); // append the parsed trackers to the array
var arg1 = argv._[0]; //this is the info_hash, torrent file or magnet link the user specifies
//this contains the type of the torrent the user specified. populated later
var torrent_type; //either "hash", "magnet" or "file"
//Do some basic parsing of the input
var time_last_peer = new Date().getTime();
//used to ensure that there is only one termination going on.
var terminating = false;
//--disable-out-file takes priority and disables anything dangerous that might modify files!
if (argv.disableOutFile) {
    argv.overwrite = false;
    argv.append = false;
}
//check if the outFile specified is ok
//this fixes #6
check_outfile();
//The fixed peer id part. Contains a string to identify the client type and the client version
var clientstring = "NT0-0-1--";
//possible choices for the random part of the peer id
var choices = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
var randomstring = "";
//generate random part of peer id
for (var i = 0; i < 11; i++) {
    randomstring += choose(choices);
}
//set the peer id (has to be a Buffer)
var peerId = new Buffer(clientstring + randomstring);
winston.info(util.format("using peer id '%s'", peerId));
//Case: Torrent File
if (arg1.endsWith(".torrent")) {
    //make sure the torrent file exists. If not, throw an exception
    try {
        stats = fs.lstatSync(arg1);
        if (stats.isFile()) {
            winston.debug("Torrent exists");
            torrent_type = "file";
            winston.debug(util.format("torrent_type is %s", torrent_type));
        }
    } catch (e) {
        winston.error("The Torrent File you specified cannot be found. Please check if the file exists and the name is correct.");
        throw {
            name: "File Error",
            message: util.format("The .torrent file '%s' you specified doesn't exist", arg1),
        };
    };
}
//case: Magnet Link
else {
    if (arg1.startsWith("magnet:")) {
        torrent_type = "magnet";
        winston.debug("torrent_type is magnet");
    } else {
        //Then it has to be an info_hash
        if (arg1.length < 40) {
            winston.error(util.format("Invalid info hash '%s' supplied, please check your input.", arg1));
            throw {
                name: "Input Error",
                message: util.format("The info_hash '%s' you specified is not valid", arg1)
            };
        }
        //case: info hash
        else {
            torrent_type = "hash";
            winston.debug("torrent_type is hash");
        }
    }
}

//done parsing torrent type

var info_hash; //info hash. In case of magnet or file we get this by parsing
if (torrent_type == "magnet") {
    var parsed = magnet(arg1);
    if (!argv.disableTrackerParsing) {
        //merging the existing tracker array with the trackers extracted from the torrent file
        trackers = trackers.concat(parsed.tr);
    }
    winston.info(util.format("converted magnet to info hash: '%s'", parsed.infoHash)); // 'e3811b9539cacff680e418124272177c47477157'
    //set info hash to the one we got from the magnet link
    info_hash = parsed.infoHash;

}
if (torrent_type == "hash") {
    //set info_hash directly to the one supplied as an argument by the user
    info_hash = arg1;
    winston.debug(util.format("info_hash is '%s'", info_hash));
}
if (torrent_type == "file") {
    winston.debug(util.format("reading file '%s'", arg1));
    //read the torrent file synchronously and store it's contents
    var torrent = fs.readFileSync(arg1);
    //parse the torrent file contents
    var parsedTorrent = parseTorrent(torrent);
    //BUG:#3
    //hack required to somehow remove the trackers stored in the parsedTorrent object
    if (argv.disableTrackerParsing) {
        parsedTorrent.announce = [];
        parsedTorrent.announceList = [];
    }
    //set the info hash to the one we got from the torrent file
    info_hash = parsedTorrent.infoHash;
    winston.info(util.format("Torrent File has info hash '%s'", info_hash));
}
//If DHT is not explicitly disabled by the user, use it.
if (!argv.disableDht) {
    var dht = new DHT();
    //set DTH to listen on the specified (or default) port
    dht.listen(argv.dhtPort, function() {
            winston.info(util.format('DHT Listening on Port %d - This may take a while'), argv.dhtPort);
        })
        //fires once we are ready to receive stuff over DHT
    dht.on('ready', function() {
            winston.info("DHT active");
            // DHT is ready to use (i.e. the routing table contains at least K nodes, discovered
            // via the bootstrap nodes)
            // find peers for the given torrent info hash
            dht.lookup(info_hash);
        })
        //Fires on a DHT related error
    dht.on('error', function(err) {
            winston.error(util.format("An Error occured with DHT: %s", err));
        })
        //fires ALWAYS when a peer has been discovered
    dht.on('peer', function(addr, hash, from) {
            store_ip(get_ip(addr), get_port(addr));
            store_ip(get_ip(from), get_port(from));
            winston.debug(util.format('[DHT] found peer %s through %s', addr, from));
        })
        //fires when the FIRST peer has been discovered
    dht.once('peer', function(addr, hash, from) {
    	store_ip(get_ip(addr), get_port(addr));
    	store_ip(get_ip(from), get_port(from));
        winston.info(util.format('[DHT] started receiving peers: %s through %s', addr, from));
    });
}
//setting a timeout to terminate the program. Otherwise it would just collect information indefinitely 
if (argv.timeout > 0) {
    setTimeout(timeoutCallback, 1000 * argv.timeout);
}
if (argv.timeoutNoPeers > 0) {
    setInterval(intervalCallback, 1000 * argv.timeoutNoPeers);
}

//If Trackers are not explicitly disabled, use them!
if (!argv.disablePex) {
	// PEX connection using bittorrent-swarm to handle connections.
    winston.info(util.format("Joining swarm for PEX"));
    var swarm = new Swarm(info_hash, peerId);
    //FIXME: Add switch to customize port for PEX
	//HACK:
    swarm.maxConns = 1000;
    swarm.on('error', function(error) { 
    	winston.error(util.format("Swarm Error: %s"));
    });
    swarm.on('wire', function(wire) {
    	 
        wire.use(ut_pex())
        
    	// If you find a peer throught PEX, add it to the ip_hashmap then connect to it to get more peers.
        wire.ut_pex.on('error', function(error) { 
    	winston.error(util.format("PEX Error: %s"));
        });
        wire.ut_pex.on('peer', function (peer) {
    	  var parts = peer.split(':');
    	  var peer_ip = parts[0];
    	  // Only add peers to the swarm that are unique. 
          if (!ip_hashmap.has(peer_ip)) {
    		  // Add discovered peers to the swarm and ask for more PEX
               swarm.addPeer(peer)
               winston.debug(util.format('[PEX] found NEW peer %s | con %s / %s', peer, swarm.numPeers, ip_hashmap.keys().length));
          } else {
//    	      winston.debug(util.format('[PEX] found OLD peer %s and con %s / %s', peer, swarm.numPeers, friends.length));
          }
          if(!pex_active) {
        	  winston.info(util.format('[PEX] started receiving peers: %s', peer));
          }
          store_ip(get_ip(peer), get_port(peer));
          pex_active = true;
          
    	  });
       });          
}
if (!argv.disableTrackers) {
    //deduplicate the trackers array
    trackers = trackers.filter(function(elem, pos) {
        return trackers.indexOf(elem) == pos;
    });
    winston.info(util.format("Deduped Tracker List contains: %s", trackers.join(", ")));
    //hackish way of construction a fake torrent object from the magnet link. Seems to work though :D
    if (torrent_type == "magnet" || torrent_type == "hash") {
        var parsedTorrent = {
            infoHash: info_hash,
            announceList: [trackers],
            announce: trackers
        };
    }
    //set the bittorrent port
    var bt_port = argv.torrentPort;

    winston.info(util.format("Preparing to listen for Bittorrent connections on %s", bt_port));
    var client = new Client(peerId, bt_port, parsedTorrent);
    //fires on a bittorrent related error
    client.on('error', function(err) {
            // fatal client error!
            winston.error(util.format("An Error occured during tracker scrape: %s", err));
        })
        //fires on a bittorrent related warning
    client.on('warning', function(err) {
        // a tracker was unavailable or sent bad data to the client. you can probably ignore it
        winston.warn(util.format("A Warning occured during tracker scrape: %s", err));
    })

    // start getting peers from the tracker
    client.start();
    //fires when we get updated info from a tracker
    client.on('update', function(data) {
            winston.debug(data);
            winston.debug('Tracker Announce: ' + data.announce);
            winston.debug('Seeders: ' + data.complete);
            winston.debug('Leechers: ' + data.incomplete);
        })
        //fires ALWAYS when a peer is found
    client.on('peer', function(addr) {
    	winston.debug(util.format('[TRACKER] found NEW peer %s', addr));
    	store_ip(get_ip(addr), get_port(addr));
    });
    //fires once a peer is found
    client.once('peer', function(addr) {
        winston.info(util.format('[TRACKER] started receiving peers: %s', addr));
        store_ip(get_ip(addr), get_port(addr));
    });
    // announce that download has completed (and you are now a seeder)
    client.complete();
    // force a tracker announce. will trigger more 'update' events and maybe more 'peer' events
    client.update();
    // stop getting peers from the tracker, gracefully leave the swarm
    client.stop();
    // ungracefully leave the swarm (without sending final 'stop' message)
    client.destroy();
    // scrape
    client.scrape();
    client.on('scrape', function(data) {
        winston.debug(data);
        winston.debug('scrape response: ' + data.announce);
        winston.debug('seeders: ' + data.complete);
        winston.debug('leechers: ' + data.incomplete);
        winston.debug('total downloads of torrent: ' + data.incomplete);
    });
}

function add_ip_to_swarm(ip) {
	
	
} 
//storage functions
//store a ip adress (in hashmap, this doesn't write to disk. see persist_ips() for that)
function store_ip(ip, port) {
        
        //ips.push(ip); //deprecated, we are using a hashmap instead
        if (ip_hashmap.get(ip)) {
            //ip already exists	
        } else {
        	if (argv.printPeers) {
                console.log(ip);
            }
            ip_hashmap.set(ip, port);
            //set the peer to the current time
            time_last_peer = new Date().getTime();
            if(!argv.disablePex) {
            swarm.addPeer(ip+":"+port);
            //winston.debug(util.format('adding peer %s to swarm', ip));
            //
            }
        }

    }

process.on('SIGINT', function() {
    winston.warn("Preparing to terminate because of user request. Press Ctrl + C again to force exit.");
    timeoutCallback();

});

//this fires once the timeout is reached
function timeoutCallback() {
        terminating = true;
        winston.info("terminating because of timeout!");
        
        //write gathered ips to file
        persist_ips();
        //this raises an error when trackers are disabled
        try {
        	//gracefully leave the swarm
        	client.stop();
        	// ungracefully leave the swarm (without sending final 'stop' message)
        	client.destroy();
        }
        catch(e) {
        	//NOTHING
        }
        try {
        	swarm.destroy();
        }
        catch(e) {
        	
        }
        //terminate the program
        process.exit();
    }

//called every time the timeout-no-peers interval fires
function intervalCallback() {
        var delta = (new Date().getTime() - time_last_peer) / 1000;
        winston.debug(util.format("delta is %s", delta));
        if (delta > argv.timeoutNoPeers) {

            if (ip_hashmap.keys().length > 0) {
                winston.info("Got no new peers in time. Terminating");
                if (!terminating) { //this should prevent timeoutCallback from being called in parallel. Not sure if it works though...
                    timeoutCallback();
                }
            } else {
                winston.info("Didn't terminate yet because no peers at all have been found");
            }
        }
        time_last_peer = new Date().getTime();
    }
    //debug function to list all gathered ips. Currently not used
function debug_ips() {
        console.log(ip_hashmap.keys());
    }
    //writes gathered ips to disk
function persist_ips() {
        check_outfile();
        if (argv.overwrite && is_file(argv.outFile) && !argv.disableOutFile) {
            //delete the file if it exists
            delete_outfile();
        }
        //	//This fixes #7, "add --disable-out-file switch"
        if (!argv.disableOutFile) {
            ip_hashmap.forEach(function(value, key) {
                fs.appendFileSync(argv.outFile, key + +":"+value+'\n');
            });
        }

        winston.info(util.format("Got %d ips", ip_hashmap.keys().length));
    }
    //checks if a file exists on the filesystem
function delete_outfile() {
    try {
        fs.unlinkSync(argv.outFile);
    } catch (error) {
        winston.error(util.format("failed to delete file '%s', aborting!", argv.outfile));
        throw {
            name: "File Error",
            message: util.format("The output file '%s' you specified could not be deleted (--overwrite)", argv.outFile),
        };
    }

}

function is_file(file) {
    var throwOutfileError = false;
    try {
        var outfilestats = fs.lstatSync(file);
        if (outfilestats.isFile()) {
            //winston.error(util.format("The output file '%s' aready exists, if you wish to overwrite, add the overwrite option", argv.outFile));
            throwOutfileError = true;

        };

    } catch (e) {
        return false;
    }
    if (throwOutfileError) {
        return true;
    };
}
//get ip adress from ip:port string
function get_ip(ip_port_string) {
	return ip_port_string.split(":")[0]
}
function get_port(ip_port_string) {
	return ip_port_string.split(":")[1]
}
function check_outfile() {
        if (!(argv.overwrite || argv.append || argv.disableOutFile)) {

            if (is_file(argv.outFile)) {
                winston.error(util.format("The output file '%s' aready exists, if you wish to overwrite, add the overwrite option", argv.outFile));
                throw {
                    name: "File Error",
                    message: util.format("The output file '%s' you specified already exist", argv.outFile),
                };
            } else {
                winston.debug("Passed Output file check. Continuing.'");
            }
        }
    }

//returns a random number between min and max. Currently unused
function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }

//chooses a random element from a specified array. Used to generate the peer id
function choose(choices) {
    var index = Math.floor(Math.random() * choices.length);
    return choices[index];
};