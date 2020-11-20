
const http = require("http").createServer();
const io = require("socket.io")(http);
const socketIO = require("socket.io-client");
const balancerURL = "http://localhost:4001";
const port = 4002;
var balancer = '';
const log = console.log;
let index = 0;

var nodos = new Map();

const selectNodo = () => {
    var urlNodos = Array.from(nodos.values());
    let cant = urlNodos.length;
    if(index >= cant)
      index = 0;

    if(cant > 0){
      index++;
    	return urlNodos[index];
    }else {
    	return '';
    }

}

const increaseIndex = () => {
  index++;
}

balancer = socketIO(balancerURL, {
     query: { type: 'balancer'}
 });


balancer.on('added-nodo', (data) => {
   console.log(data);
    if(!nodos.has(data.socketId)){
      nodos.set(data.socketId, data.url)
    }
})

balancer.on('deleted-nodo', (data) => {
  if(nodos.has(data.socketId)){
    nodos.delete(data.socketId);
    console.log('deleted', data.socketId)
  }
})


balancer.on('initial-nodes', (data) => {
  [... data].forEach(([k,v]) => {
    if(!nodos.has(k)){
      nodos.set(k,v);
    }
  })
  console.log(nodos);
})

balancer.on('request-nodes', (socket) => {
  balancer.emit('initial-nodes', [...nodos]);
});

const addNodo = (id, nodoUrl) => {
  nodoKey = getByValue(nodos, nodoUrl);
  nodos.delete(nodoKey);
  nodos.set(id, nodoUrl);
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
      if(balancer != ''){
        balancer.emit('added-nodo', {socketId: socket.id, url: nodoUrl});
      }
    }else {
      let nod  = selectNodo()
      console.log('reconnecting', nod);
    	socket.emit('nodo', nod);
    }

    socket.on("reconnect-server", () => {
      socket.emit('nodo', selectNodo());
      increaseIndex();
    })

    socket.on("disconnect", () => {
      nodos.delete(socket.id);
    })
})


http.listen(port, () => log("Server on port: " + port));
