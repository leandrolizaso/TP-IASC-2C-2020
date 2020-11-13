port=2999
input=$1

if [ "$input" ]; then
	if [ "$input" -gt "$port" ]; then
		node ../node-pigeon-basic-server/server.js $1
	else
		echo "port must be 3000 or higher"
	fi
else
	echo "you must enter a port"
fi
