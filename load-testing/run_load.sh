script=$1
port=$2
echo "Running ${script} on node at port ${port}"
artillery run --target http://localhost:${port} ${script}
