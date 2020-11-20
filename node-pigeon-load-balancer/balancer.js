
const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 4001;
const log = console.log;
let index = 0;

var balancerSocket = '';

var nodos = new Map();

const selectNodo = () => {
    var urlNodos = Array.from(nodos.values());
    let cant = urlNodos.length;
    if(index >= cant)
      index = 0;

    if(cant > 0){
    	return urlNodos[index];
    }else {
    	return '';
    }
}

const increaseIndex = () => {
  index++;
}

const addNodo = (id, nodoUrl) => {
  nodoKey = getByValue(nodos, nodoUrl);
  nodos.delete(nodoKey);
  nodos.set(id, nodoUrl);
  console.log(nodos);
};

function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue)
      return key;
  }
}


io.on("connection", (socket) => {

    console.log(socket.handshake);

    if(socket.handshake.query.type == 'nodo'){
    	const nodoUrl = socket.handshake.query.url;
    	addNodo(socket.id, nodoUrl);
      if(balancerSocket != ''){
        balancerSocket.emit('added-nodo', {socketId: socket.id, url: nodoUrl});
      }

    }else if(socket.handshake.query.type == 'balancer'){
      balancerSocket = socket;
      if(nodos.size > 0) {
        socket.emit('initial-nodes',[...nodos]);
      }else {
        socket.emit('request-nodes');
      }
    }
    else{
    	socket.emit('nodo', selectNodo());
      increaseIndex();
    }

    socket.on('added-nodo', (data) => {
      if(!nodos.has(data.socketId)){
        nodos.set(data.socketId, data.url)
      }
    })

    socket.on('initial-nodes', (data) => {
      [... data].forEach(([k,v]) => {
         if(!nodos.has(k)){
           nodos.set(k,v);
         }
       });

       console.log(nodos);
    })

    socket.on('deleted-nodo', (data) => {
      if(nodos.has(data.socketId)){
        nodos.delete(data.socketId, data.url)
      }
    })

    socket.on("reconnect-server", () => {
      socket.emit('nodo', selectNodo());
    })

    socket.on("disconnect", () => {
      if(nodos.has(socket.id)){
        nodos.delete(socket.id);
        if (balancerSocket)
          balancerSocket.emit('deleted-nodo', {socketId: socket.id});
      }

    })
})


http.listen(port, () => log("Server on port: " + port));
