const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 5000;
const log = console.log;
const util = require('util');
const exec = util.promisify(require('child_process').exec);


var nodos = new Map();
var chatLocation = [];
var nodosHealh = new Map();

const addNodo = (id, nodoUrl) => {
  nodoKey = getByValue(nodos, nodoUrl);
  nodos.delete(nodoKey);
  nodos.set(id, nodoUrl);
  console.log(nodos);
};

const spawnNodo = async () => {
  //run docker
  const result = await exec('');
  console.log(nodos);
};

function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue)
      return key;
  }
}

var checkInterval = setInterval(function(){io.to('Nodos').emit('healt-check');}, 60000);
//puede ponerse en el nodo y es un mensaje menos


io.on("connection", (socket) => {

    console.log(socket.handshake);

    if(socket.handshake.query.type == 'nodo'){
      socket.join('Nodos');
    	const nodoUrl = socket.handshake.query.url;
    	addNodo(socket.id, nodoUrl);
    }

    socket.on('added-nodo', (data) => {
      if(!nodos.has(data.socketId)){
        nodos.set(data.socketId, data.url)
      }
    })

    socket.on('added-chat', (data) => {
      chatLocation.push({
        chatID: data.chatID,
        nodo: data.url
      });
    })

    socket.on('deleted-chat', (data) => {
      chatLocation = chatLocation.filter(c => c.chatID != data.chatID);
    })

    socket.on('initial-nodes', (data) => {
      [... data].forEach(([k,v]) => {
         if(!nodos.has(k)){
           nodos.set(k,v);
         }
       });

       console.log(nodos);
    })

    socket.on('healt-report', (data) => {
      //todo
      //if()
        spawnNodo();
    })

    socket.on('deleted-nodo', (data) => {
      chatLocation = chatLocation.filter(c => c.nodo != data.url);
      if(nodos.has(data.socketId)){
        nodos.delete(data.socketId, data.url)
      }
    })

    socket.on("disconnect", () => {
      chatLocation = chatLocation.filter(c => c.nodo != data.url);
      if(nodos.has(socket.id)){
        nodos.delete(socket.id);
      }

    })
})


http.listen(port, () => log("Server on port: " + port));
