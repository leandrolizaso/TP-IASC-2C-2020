echo "Running redis (if redis image isn't present it will be downloaded first)..."
sudo docker run -d -p 6379:6379 --name iascgrupo1-redis redis 
echo "Running monitor status..."
sudo mkdir -p /var/log/monitor/Permanentlogs
sudo docker run -d -p 5005:5005 --network="host" -v /var/log/monitor/Permanentlogs:/usr/src/monitor/Permanentlogs iascgrupo1/monitor
echo "Running main balancer..."
sudo docker run -d --network="host" iascgrupo1/balancer 4001
echo "Running backup balancer..."
sudo docker run -d --network="host" iascgrupo1/balancer 4002 4001
echo "Running master..."
sudo docker run -d --network="host" -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock --name iascgrupo1-master iascgrupo1/master 5000
echo "Running master backup..."
sudo docker run -d --network="host" -v $(which docker):/usr/bin/docker -v /var/run/docker.sock:/var/run/docker.sock --name iascgrupo1-master-backup iascgrupo1/master 5001 5000
