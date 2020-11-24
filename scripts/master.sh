echo "Running master..."
sudo docker run --network="host" -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock --name iascgrupo1-master iascgrupo1/master 5000
