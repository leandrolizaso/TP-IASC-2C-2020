script=$1
port=$2
echo "Running ${script} on node at port ${port}"
DEBUG=* artillery run ${script} -v '{"port":"${port}"}'
