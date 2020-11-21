const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 5000;
const log = console.log;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
let serverPort = 3010;

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
  exec('docker run --network="host" iascgrupo1/server ' + serverPort);
  serverPort ++;
  console.log(nodos);
};

const isSpawnNeccesary = () => {
  //todo: definir politica de carga
  return false;
};

const selectFreeNodo = (socket) => {
  return getByValue(nodosHealh, Math.min(...nodosHealh.values()));

};

const manageChatCopy = (socket, chat, chatID) => {
  let nodosCopy = new Map(nodosHealh);
  nodosCopy.delete(socket);
  let newChatLocation = getByValue(nodosCopy, Math.min(...nodosCopy.values()));
  newChatLocation.emit('add-chat-copy', {chat: chat, chatID: chatID});
  chatLocation.push({
    chatID: chatID,
    nodo: nodos.get(newChatLocation)
  });

};

function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue)
      return key;
  }
}


var checkInterval = setInterval(function(){io.to('Nodos').emit('health-check');}, 10000);

var spawnInterval = setInterval(function(){spawnNodo();}, 10000);



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
      manageChatCopy(socket.id, data.chat, chatID);
      log(chatLocation);
    })

    socket.on('initial-nodes', (data) => {
      [... data].forEach(([k,v]) => {
         if(!nodos.has(k)){
           nodos.set(k,v);
         }
       });

       console.log(nodos);
    })

    socket.on('health-report', (data) => {
      nodosHealh.set(socket.id, data);
      //if(isSpawnNeccesary())
      //  spawnNodo();
    })

    socket.on('free-nodo', (data) => {
      socket.emit('free-nodo', selectFreeNodo(socket.id));
    })

    socket.on('deleted-nodo', (data) => {
      chatLocation = chatLocation.filter(c => c.nodo != data.url);
      if(nodos.has(data.socketId)){
        nodos.delete(data.socketId, data.url)
      }
    })

    socket.on("disconnect", () => {
      let nodo = nodos.get(socket.id);
      chatLocation = chatLocation.filter(c => c.nodo != nodo);
      if(nodos.has(socket.id)){
        nodos.delete(socket.id);
      }
      spawnNodo();
    })
})


http.listen(port, () => log("Server on port: " + port));
