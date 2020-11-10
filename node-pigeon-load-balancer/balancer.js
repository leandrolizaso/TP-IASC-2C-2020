
const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 4001;
const log = console.log;

var balancerSocket = '';

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

io.on("connection", (socket) => {

    console.log(socket.handshake);

    if(socket.handshake.query.type == 'nodo'){
    	const nodoUrl = socket.handshake.query.url;
    	nodos.set(socket.id, nodoUrl);
      if(balancerSocket != ''){
        balancerSocket.emit('added-nodo', {socketId: socket.id, url: nodoUrl});
      }

    }else if(socket.handshake.query.type == 'balancer'){
     const newNodos = socket.handshake.query.nodos;
     balancerSocket = socket;
     //agrego los nodos que me faltan
//      newNodos.forEach((item) => {
//       console.log(item)
//     });

     socket.emit('initial-nodes',[...nodos]);
    }
    else{
    	socket.emit('nodo', selectNodo());
    }

    socket.on('added-nodo', (data) => {
      if(!nodos.has(data.socketId)){
        nodos.set(data.socketId, data.url)
      }
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
