
const http = require("http").createServer();
const io = require("socket.io")(http);
const socketIO = require("socket.io-client");
const balancerURL = "http://localhost:4001";
const port = 4002;
var balancer = '';
const log = console.log;

var nodos = new Map();

const selectNodo = () => {
    var urlNodos = Array.from(nodos.values());
    if(urlNodos.length > 0){
    	 return urlNodos.random();
    }else {
    	return '';
    }

}

Array.prototype.random = function(){
  return this[Math.floor(Math.random()*this.length)];
}

balancer = socketIO(balancerURL, {
     query: { nodos: JSON.stringify((nodos)), type: 'balancer'}
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
  //agrego los nodos que no tengo
})


io.on("connection", (socket) => {

    console.log(socket.handshake);

    if(socket.handshake.query.type == 'nodo'){
    	const nodoUrl = socket.handshake.query.url;
    	nodos.set(socket.id, nodoUrl);
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
    })

    socket.on("disconnect", () => {
      nodos.delete(socket.id);
    })
})


http.listen(port, () => log("Server on port: " + port));
