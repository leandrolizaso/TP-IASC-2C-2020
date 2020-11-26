echo "Building images..."
sudo docker build -t iascgrupo1/master ../node-pigeon-master
sudo docker build -t iascgrupo1/server ../node-pigeon-basic-server
sudo docker build -t iascgrupo1/balancer ../node-pigeon-load-balancer
echo "Images built successfully"
