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
//this check is to make sure not all means of gathering IP adresses are disabled
var disable_check = function disable_check(argv, b) {
        if (argv.disableDht && argv.disableTrackers) {
            winston.debug("Can't disable DHT AND Trackers. Only one is possible.'");
            return "Failure! You can't disable both DHT and Trackers. Choose one.";
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
    .check(disable_check)
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
    .alias('t', 'timeout')
    .default('t', 300)
    .describe('t', 'The timout in seconds after the program terminates and stops looking for new Peers')
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
    .boolean("disable-tracker-parsing")
    .describe("disable-tracker-parsing", "Disables looking for trackers in the torrent file or magnet link. Only uses those provided in --trackers")
    .demand(1)
    .help('h')
    .alias('h', 'help')
    .epilog("by stefan.github@gmail.com")
    .string('_')
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
//check if the outFile specified is ok
//this fixes #6
check_outfile();
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
            winston.error(utils.format("Invalid info hash '%s' supplied, please check your input.", arg1));
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
        store_ip(addr);
        store_ip(from);
        winston.debug(util.format('found peer %s through %s', addr, from));
    })
    //fires when the FIRST peer has been discovered
    dht.once('peer', function(addr, hash, from) {
        store_ip(addr);
        store_ip(from);
        winston.info(util.format('started receiving peers: %s through %s', addr, from));
    });
}
//setting a timeout to terminate the program. Otherwise it would just collect information indefinitely 
setTimeout(timeoutCallback, 1000 * argv.timeout);

//If Trackers are not explicitly disabled, use them!
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
    winston.debug(util.format("using peer id '%s'", peerId));
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
        store_ip(addr);
    });
    //fires once a peer is found
    client.once('peer', function(addr) {
    	winston.info(util.format('started receiving peers: %s from trackers', addr));
        store_ip(addr);
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
//storage functions
//store a ip adress (in hashmap, this doesn't write to disk. see persist_ips() for that)
function store_ip(ip) {
    if (argv.printPeers) {
        console.log(ip);
    }
    //ips.push(ip); //deprecated, we are using a hashmap instead
    ip_hashmap.set(ip, true);
}
//this fires once the timeout is reached
function timeoutCallback() {
    winston.info("terminating because of timeout!");
    //write gathered ips to file
    persist_ips();
    //terminate the program
    process.exit();
}
//debug function to list all gathered ips. Currently not used
function debug_ips() {
    console.log(ip_hashmap.keys());
}
//writes gathered ips to disk
function persist_ips() {
	check_outfile(); 
    if ( argv.overwrite && is_file(argv.outFile)) {
    		//delete the file if it exists
    		delete_outfile();
        }
//	//BUG: #6: when --overwrite is set, delete file first if it exists
//	//TODO: #7 add --disable-out-file switch
    ip_hashmap.forEach(function(value, key) {
    	fs.appendFileSync(argv.outFile, key + '\n');
    });


    winston.info(util.format("Got %d ips", ip_hashmap.keys().length));
}
//checks if a file exists on the filesystem
function delete_outfile() {
	try {
		fs.unlinkSync(argv.outFile);
	}
	catch(error) {
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

function check_outfile() {
	if ( ! (argv.overwrite || argv.append) ) {

	if(is_file(argv.outFile)) {
		winston.error(util.format("The output file '%s' aready exists, if you wish to overwrite, add the overwrite option", argv.outFile));
		throw {
            name: "File Error",
            message: util.format("The output file '%s' you specified already exist", argv.outFile),
        };
	}
	else {
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
