
const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 4000;
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

io.on("connection", (socket) => {
    
    console.log(socket.handshake);
    
    if(socket.handshake.query.type == 'nodo'){
    	const nodoUrl = socket.handshake.query.url;
    	nodos.set(socket.id, nodoUrl);
    }else {
    	socket.emit('nodo', selectNodo());
    }
    
    socket.on("reconnect-server", () => {
      socket.emit('nodo', selectNodo());
    })
    
    socket.on("disconnect", () => {
      nodos.delete(socket.id);
    })
})


http.listen(port, () => log("Server on port: " + port));
