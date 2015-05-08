ips = []
with open("peers.txt") as f:
    for line in f:
        ips.append(line.strip())
print("total: {}".format(len(ips)))
print("unique: {}".format(len(list(set(ips)))))
