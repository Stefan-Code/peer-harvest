var fs = require("fs");
var util = require("util");
var winston = require('winston');
var DHT = require('bittorrent-dht');
var magnet = require('magnet-uri');
var Client = require('bittorrent-tracker');
var parseTorrent = require('parse-torrent');
var fs = require('fs');
require('string.prototype.endswith');
require('string.prototype.startswith');
var ips = [];
var trackers = [];
// winston.level = 'debug';
winston.cli();
var disable_check = function disable_check(argv, b) {
        if (argv.disableDht && argv.disableTrackers) {
            winston.debug("Can't disable DHT AND Trackers. Only one is possible.'")
            return "Failure! You can't disable both DHT and Trackers. Choose one."
        } else {
            return true;
        }
    }
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
winston.debug("initialized.")
winston.debug(util.format("winston level is %s"), winston.level);
// Do some basic parsing
var argv_trackers = argv.trackers.split(","); // convert the tracker string of trackers from the arguments to an array
trackers = trackers.concat(argv_trackers); // append the parsed trackers to the array
var arg1 = argv._[0]
var torrent_type;
if (arg1.endsWith(".torrent")) {
    try {
        stats = fs.lstatSync(arg1);
        if (stats.isFile()) {
            winston.debug("Torrent exists");
            torrent_type = "file";
            winston.debug(util.format("torrent_type is %s", torrent_type));
        }
    } catch (e) {
        winston.error("The Torrent File you specified cannot be found. Please check if the file exists and the name is correct.")
        throw {
            name: "File Error",
            message: util.format("The .torrent file '%s' you specified doesn't exist", arg1)
        };
    }
} else {
    if (arg1.startsWith("magnet:")) {
        torrent_type = "magnet";
        winston.debug("torrent_type is magnet");
    } else {
        //Then it has to be an info_hash
        if (arg1.length < 40) {
            winston.error(utils.format("Invalid info hash '%s' supplied, please check your input.", arg1))
            throw {
                name: "Input Error",
                message: util.format("The info_hash '%s' you specified is not valid", arg1)
            };
        } else {
            torrent_type = "hash";
            winston.debug("torrent_type is hash");
        }
    }
}

//done parsing torrent type


var info_hash;
if (torrent_type == "magnet") {
    var parsed = magnet(arg1);
    if (!argv.disableTrackerParsing) {
        trackers = trackers.concat(parsed.tr);
    }
    winston.info(util.format("converted magnet to info hash: '%s'", parsed.infoHash)); // 'e3811b9539cacff680e418124272177c47477157'
    //console.log(parsed);
    info_hash = parsed.infoHash;

}
if (torrent_type == "hash") {
    info_hash = arg1;
    winston.debug(util.format("info_hash is '%s'", info_hash))
}
if (torrent_type == "file") {
    winston.debug(util.format("reading file '%s'", arg1))
    var torrent = fs.readFileSync(arg1);
    var parsedTorrent = parseTorrent(torrent);
    info_hash = parsedTorrent.infoHash;
    winston.info(util.format("Torrent File has info hash '%s'", info_hash));
}

if (!argv.disableDht) {
    var dht = new DHT()
    dht.listen(argv.dhtPort, function() {
        winston.info(util.format('DHT Listening on Port %d - This may take a while'), argv.dhtPort)
    })

    dht.on('ready', function() {
        winston.info("DHT active")
            // DHT is ready to use (i.e. the routing table contains at least K nodes, discovered
            // via the bootstrap nodes)
            // find peers for the given torrent info hash
        dht.lookup(info_hash)
    })

    dht.on('error', function(err) {
        winston.error(util.format("An Error occured with DHT: %s", err));
    })

    dht.on('peer', function(addr, hash, from) {
        store_ip(addr);
        store_ip(from);
        winston.debug(util.format('found peer %s through %s', addr, from));
    })
    dht.once('peer', function(addr, hash, from) {
        store_ip(addr);
        store_ip(from);
        winston.info(util.format('started receiving peers: %s through %s', addr, from));
    });
}
setTimeout(timeoutCallback, 1000 * argv.timeout);


if (!argv.disableTrackers) {
    trackers = trackers.filter(function(elem, pos) {
        return trackers.indexOf(elem) == pos;
    });
    winston.info(util.format("Deduped Tracker List contains: %s", trackers.join(", ")));

    if (torrent_type == "magnet" || torrent_type == "hash") {
        var parsedTorrent = {
            infoHash: info_hash,
            announceList: [trackers],
            announce: trackers
        }
    }
    var clientstring = "NT0-0-1--";
    var choices = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    var randomstring = "";
    for (var i = 0; i < 11; i++) {
        randomstring += choose(choices);
    }
    var peerId = new Buffer(clientstring + randomstring);
    winston.debug(util.format("using peer id '%s'", peerId));
    var bt_port = argv.torrentPort;

    winston.info(util.format("Preparing to listen for Bittorrent connections on %s", bt_port))
    var client = new Client(peerId, bt_port, parsedTorrent)

    client.on('error', function(err) {
        // fatal client error!
        winston.error(util.format("An Error occured during tracker scrape: %s", err));
    })

    client.on('warning', function(err) {
        // a tracker was unavailable or sent bad data to the client. you can probably ignore it
        winston.warn(util.format("A Warning occured during tracker scrape: %s", err));
    })

    // start getting peers from the tracker
    client.start()
    client.on('update', function(data) {
        winston.debug(data);
        winston.debug('Tracker Announce: ' + data.announce)
        winston.debug('Seeders: ' + data.complete)
        winston.debug('Leechers: ' + data.incomplete)
    })

    client.on('peer', function(addr) {
        store_ip(addr);
    });

    client.once('peer', function(addr) {
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
        winston.debug('scrape response: ' + data.announce)
        winston.debug('seeders: ' + data.complete)
        winston.debug('leechers: ' + data.incomplete)
        winston.debug('total downloads of torrent: ' + data.incomplete)
    });
}
//storage functions
function store_ip(ip) {
    if (argv.printPeers) {
        console.log(ip)
    }
    ips.push(ip)
}

function timeoutCallback() {
    winston.info("terminating because of timeout!");
    persist_ips();
    process.exit();
}

function debug_ips() {
    console.log(ips)
}

function persist_ips() {
    if (!argv.overwrite) {
        var throwOutfileError = false;
        try {
            var outfilestats = fs.lstatSync(argv.outFile);
            if (outfilestats.isFile()) {
                winston.error(util.format("The output file '%s' aready exists, if you wish to overwrite, add the overwrite option", argv.outFile));
                throwOutfileError = true;

            }

        } catch (e) {
            winston.debug("Passed Output file check. Continuing.'")
        }
        if (throwOutfileError) {
            throw {
                name: "File Error",
                message: util.format("The output file '%s' you specified already exist", argv.outFile)
            };
        }
    }
    for (var i = 0; i < ips.length; i++) {

        fs.appendFileSync(argv.outFile, ips[i] + '\n');
    }
    winston.info(util.format("Got %d ips", ips.length))
}

function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function choose(choices) {
    var index = Math.floor(Math.random() * choices.length);
    return choices[index];
}