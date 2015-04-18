# peer-harvest
###A Script to gather the IP Adresses of Bittorrent Peers for a given Torrent
##Usage:
For built-in help run:
```bash
node peer-harvest.js --help
```
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
It will also extract the Trackers from the magnet link and query them.

For working just with a info hash you can do the following:
```bash
node peer-harvest.js --out-file peers.txt B415C913643E5FF49FE37D304BBB5E6E11AD5101
```

There are also many other options:
```txt
Usage: C:\Users\SK\Programming\peer-harvest\peer-harvest.js -o peers.txt some.torrent | INFO_HASH | magnet:url

Options:
  -v, --verbosity     output verbosity. 0: errors, 1:warnings, 2:info, 3:debug                            [default: 2]
  --disable-dht       Disable DHT and use Trackers only                                                 
  --disable-trackers  Disable Trackers and use DHT only                                                 
  --print-peers       sends all peers to stdout - useful with the --silent option to parse output       
  -s, --silent        supress any unnecessary output                                                    
  -o, --out-file      Specify the file IPs will get written to                                            [default: "peers.txt"]
  --dht-port          The Port to be used for DHT                                                         [default: 20000]
  -t, --timeout       The timout in seconds after the program terminates and stops looking for new Peers  [default: 300]
  -p, --torrent-port  The Port we are listening on for Bittorrent connections                             [default: 6881]
  -l, --trackers      A comma seperated list of trackers to query                                         [default: "udp://open.demonii.com:1337,udp://tracker.coppersurfer.tk:6969"]
  --overwrite         Overwrite output file if it already exists                                        
  -h, --help          Show help                                                                         

by stefan.github@gmail.com


```
If you have any questions, feel free to open a new Issue.
