# peer-harvest
###A Script to gather the IP Adresses of Bittorrent Peers for a given Torrent
##Installation
Download the latest Release (not the current master branch, it may be unstable!) extract it and locate package.json.
Also you need to have nodejs and npm installed.
In this directory then run the following from the command line:
```
npm install
```
This will download all the necessary dependencies for you and put them in the right place.
##Usage:
For built-in help run:
```bash
node peer-harvest.js --help
```
Please note that you may have to manually symlink node to nodejs. (or use `nodejs peer-harvest.js --help`)
For using it with a .torrent file run:
```bash
node peer-harvest.js --out-file peers.txt example.torrent
```
which assumes that you have a file called 'example.torrent' in the same directory.
The found Peer IP adresses will then be written into a file called 'peers.txt'.

The script will also work with magnet links like so:
```bash
node peer-harvest.js --out-file peers.txt "magnet:?xt=urn:btih:B415C913643E5FF49FE37D304BBB5E6E11AD5101&dn=ubuntu-14.10-desktop-amd64.iso&tr=http%3a%2f%2ftorrent.ubuntu.com%3a6969%2fannounce&tr=http%3a%2f%2fipv6.torrent.ubuntu.com%3a6969%2fannounce"
```
It will also extract the Trackers from the magnet link and query them. Just make sure to wrap the magnet link url in quotes!

For working just with a info hash you can do the following:
```bash
node peer-harvest.js --out-file peers.txt B415C913643E5FF49FE37D304BBB5E6E11AD5101
```

There are also many other options:
```txt
Usage: node peer-harvest.js -o peers.txt some.torrent | INFO_HASH | magnet:url

Options:
  -o, --out-file             Specify the file IPs will get written to  [default: "peers.txt"]
  -v, --verbosity            output verbosity. 0: errors, 1:warnings, 2:info, 3:debug  [default: 2]
  -s, --silent               supress any unnecessary output  [boolean]
  --print-peers              sends all peers to stdout - useful with the --silent option to parse output  [boolean]
  -t, --timeout              The timout in seconds after the program terminates and stops looking for new Peers. Set to '0' (zero) to disable.  [default: 420]
  --timeout-no-peers         Time after which the program terminates once no new peers have been found. Takes no effect until a peer is found. Set to '0' (zero) to disable.  [default: 30]
  --dht-port                 The Port to be used for DHT  [default: 20000]
  -p, --torrent-port         The Port we are listening on for Bittorrent connections  [default: 6881]
  --max-connections          Max. number of connections for PEX  [default: 2000]
  -l, --trackers             A comma seperated list of trackers to query  [default: "udp://open.demonii.com:1337,udp://tracker.coppersurfer.tk:6969"]
  --disable-trackers         Disable Trackers and use DHT only  [boolean]
  --disable-dht              Disable DHT and use Trackers only  [boolean]
  --disable-pex              Disable Peer Exchange  [boolean]
  --disable-tracker-parsing  Disables looking for trackers in the torrent file or magnet link. Only uses those provided in --trackers  [boolean]
  --disable-out-file         Disables output to file. Useful together with --print-peers.  [boolean]
  --overwrite                Overwrite output file if it already exists  [boolean]
  --append                   Append to the output file if it already exists - CAREFUL: This may lead to duplicates in the output file!  [boolean]
  -h, --help                 Show help

by stefan.github@gmail.com


```
If you have any questions, feel free to open a new Issue.
