echo "Building images..."
sudo docker build -t iascgrupo1/master ../node-pigeon-master
sudo docker build -t iascgrupo1/client ../node-pigeon-client
sudo docker build -t iascgrupo1/server ../node-pigeon-basic-server
sudo docker build -t iascgrupo1/balancer ../node-pigeon-load-balancer
sudo docker build -t iascgrupo1/balancer_backup ../node-pigeon-load-balancer-client
echo "Images built successfully"
