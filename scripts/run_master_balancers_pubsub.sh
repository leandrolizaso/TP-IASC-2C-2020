echo "Running redis (if redis image isn't present it will be downloaded first)..."
sudo docker run -d -p 6379:6379 --name iascgrupo1-redis redis 
echo "Running main balancer..."
sudo docker run -d -p 4001:4001 --name iascgrupo1-balancer iascgrupo1/balancer
echo "Running backup balancer..."
sudo docker run -d -p 4002:4002 --name iascgrupo1-balancer_backup iascgrupo1/balancer_backup
echo "Running master..."
sudo docker run -d --network="host" -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock --name iascgrupo1-master iascgrupo1/master 5000
echo "Running master backup..."
sudo docker run -d --network="host" -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock --name iascgrupo1-master-backup iascgrupo1/master 5001 5000
