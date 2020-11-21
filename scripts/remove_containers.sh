echo "Stopping and removing containers..."
containers=$(sudo docker ps -q)
if [ -z "${containers}" ]; then
	echo "There are no more containers"
else
	sudo docker stop $containers
	sudo docker rm $containers
	echo "All containers have been removed"
fi

