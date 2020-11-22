echo "Running master..."
sudo docker run -p 5000:5000 -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock iascgrupo1/master
