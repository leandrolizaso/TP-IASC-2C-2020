echo "Running master..."
sudo docker run -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock iascgrupo1/master
