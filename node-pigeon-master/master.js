const http = require("http").createServer();
const io = require("socket.io")(http);
const port = 5000;
const log = console.log;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const minNodes = 3;
let serverPort = 3010;

const nodos = new Map();
//[{"socketID": port}, ...]

const chatLocation = [];
//[{chatID, nodePort}, ...]

const nodosHealth = new Map();
//[{"socketID": messagesIn10SecPeriod}, ...]

const addNodo = (id, nodoUrl) => {
  nodoKey = getByValue(nodos, nodoUrl);
  nodos.delete(nodoKey);
  nodos.set(id, nodoUrl);
  console.log(nodos);
};

const spawnNodo = async () => {
  exec('docker run --network="host" iascgrupo1/server ' + serverPort).catch(_ => {
    console.log("Couldnt spawn node at %i", serverPort);
  });
  serverPort ++;
  console.log(nodos);
};

const isSpawnNecessary = () => {
  //todo: definir politica de carga
  return false;
};

const selectFreeNodo = (socket) => {
  return getByValue(nodosHealth, Math.min(...nodosHealth.values()));
};

const manageChatCopy = (socket, chat, chatID) => {
  let nodosCopy = new Map(nodosHealth);
  nodosCopy.delete(socket);
  let newChatLocation = getByValue(nodosCopy, Math.min(...nodosCopy.values()));
  if (newChatLocation) {
    io.to(newChatLocation).emit('add-chat-copy', {chat: chat, chatID: chatID});
    chatLocation.push({
      chatID: chatID,
      nodo: nodos.get(newChatLocation)
    });
  }
};

const makeChatCopy = (chatID) => {
  chatLocation = chatLocation.find(c => c.chatID == chatID);
  if(chatLocation){
    io.to(chatLocation).emit('send-copy', chatID);
  }
};

const updateChats = (nodo, socket) => {
  if(nodos.has(socket)){
    nodos.delete(socket);
  }
  needBackup = chatLocation.filter(c => c.nodo == nodo);
  chatLocation = chatLocation.filter(c => c.nodo != nodo);
  needBackup.forEach(c => makeChatCopy(c.chatID));

};

function getByValue(map, searchValue) {
  for (let [key, value] of map.entries()) {
    if (value === searchValue)
      return key;
  }
}

function initNodes() {
	for (let i=0; i < minNodes; i++) {
		spawnNodo();
	}
}

var checkInterval = setInterval(function(){io.to('Nodos').emit('health-check');}, 10000);

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
      log(chatLocation);
      log(data)
      manageChatCopy(socket.id, data.chat, data.chatID);
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
      nodosHealth.set(socket.id, data);
      //if(isSpawnNeccesary())
      //  spawnNodo();
    })

    socket.on('free-nodo', (data) => {
      socket.emit('free-nodo', selectFreeNodo(socket.id));
    })

    socket.on('make-copy', (data) => {
      manageChatCopy(socket.id, data.chat, data.chatID);
    })

    socket.on('deleted-nodo', (data) => {
      chatLocation = chatLocation.filter(c => c.nodo != data.url);
      if(nodos.has(data.socketId)){
        nodos.delete(data.socketId, data.url)
      }
    })

    socket.on("disconnect", () => {
      let nodo = nodos.get(socket.id);
      updateChats(nodo, socket.id);
      spawnNodo();
    })
})


http.listen(port, () => log("Server on port: " + port));
//initNodes();
