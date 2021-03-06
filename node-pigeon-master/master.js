const http = require("http").createServer();
const io = require("socket.io")(http, {pingTimeout: 30000, pingInterval: 60000});
const ioClient = require("socket.io-client");
const args = process.argv.slice(2);
const port = args[0];
const log = console.log;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const minNodes = 3;
const healthsCapacity = 3;
let serverPort = 3010;
var osu = require('node-os-utils');
let conexiones =0;
const socketMonitor = ioClient('http://localhost:5005');

const nodos = new Map();
//[{"socketID": port}, ...]

let chatLocation = [];
//[{chatID, nodePort}, ...]
//Only this structure is needed to be synchronized between master and its backup

let nodosHealth = new Map();
//[{"socketID": [last N messagesIn10SecPeriod]}, ...]

let shuttingDown = [];
//["nodo port", ...]

/**
  Main master & backup functionality
*/

let active = false;
let altPort = args[1];
let connectionToBackup;

if (altPort) {
  //Es el master backup
  connectToAlternative("backup", altPort);
} else {

}

function connectToAlternative(type, url) {
  log("%s connecting to alternative at %s", type, url);
  let opts = {
    reconnection: true,
    query: { type: type, url: port, active: active }
  }
  connectionToBackup = ioClient.connect("http://localhost:"+url, opts);
  connectionToBackup.on("reconnect_attempt", () => {
    connectionToBackup.io.opts.query.active = active;
  });
  connectionToBackup.on("connect", () => {
    if (active) {
      synchronizeBackup("chat-locations", chatLocation);
    }
  })
}

function manageActive(altActive) {
  const boolActive = altActive == "true";
  if (!boolActive) {
    log("changed to active master");
    if (!active) { //Si es la primera ejecución del master y backup se crean los nodos
      initNodes();
      log("spawned initial nodes");
    }
    active = true;
  }
}

function assignBackupEvents(socket) {
  socket.on("disconnect", () => {
    if (!active) {
      active = true;
      log("alternative disconnected, changed to active master");
    }
  });

  socket.on("chat-locations", locations => {
    chatLocation = locations;
  })

  socket.on("remove-node-chats", (nodo) => {
    chatLocation = [...chatLocation].filter(c => c.nodo != nodo);
  });

  socket.on("added-location", (locationEntry) => {
    chatLocation.push(locationEntry);
  })
}

function synchronizeBackup(event, data) {
  if (connectionToBackup && connectionToBackup.connected) {
    log("updating %s in alternative master", event);
    connectionToBackup.emit(event,data);
  }
}

 ////

const addNodo = (id, nodoUrl) => {
  nodoKey = getByValue(nodos, nodoUrl);
  nodos.delete(nodoKey);
  nodos.set(id, nodoUrl);
  console.log(nodos);
};

const spawnNodo = async () => {
  serverPort ++;
  exec('docker run -d --network="host" iascgrupo1/server ' + serverPort);
  console.log(nodos);
};

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function isSpawnNecessary() {
  const averages = [ ...nodosHealth].map(([_, healths]) => average(healths));
  return averages.every(average => average > 100) && nodosHealth.size > 0;
};

function addHealthReport(id, health) {
  if (!nodosHealth.has(id))
    nodosHealth.set(id, []);
  const healths = nodosHealth.get(id);
  healths.push(health);
  if (healths.length > healthsCapacity)
    healths.shift();
}

const manageChatCopy = (socket, chat, chatID) => {
  let nodosCopy = new Map(nodosHealth);
  nodosCopy.delete(socket);
  for (let [nodo, healths] of nodosCopy.entries()) {
    nodosCopy.set(nodo, average(healths));
  }
  log(nodosCopy, 'Nodos disponibles para copias')
  let newChatLocation = getByValue(nodosCopy, Math.min(...nodosCopy.values()));
  if (newChatLocation) {
    io.to(newChatLocation).emit('add-chat-copy', {chat: chat, chatID: chatID});
  }
};

const makeChatCopy = (chatID) => {
  let nodoChat = chatLocation.find(c => c.chatID == chatID);
  if(nodoChat){
    io.to(getByValue(nodos, nodoChat.nodo)).emit('send-copy', chatID);
  }
};

const updateChats = (nodo, socket) => {
  needBackup = [...chatLocation].filter(c => c.nodo == nodo);
  chatLocation = [...chatLocation].filter(c => c.nodo != nodo);
  synchronizeBackup("remove-node-chats", nodo);
  needBackup.forEach(c => makeChatCopy(c.chatID));
  nodos.delete(socket);
  nodosHealth.delete(socket);
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

var checkInterval = setInterval(function(){
  io.to('Nodos').emit('health-check');
  setTimeout(() => {
    if (isSpawnNecessary())
      spawnNodo();
  }, 1000); //les damos 1s para reportar su salud y de ahí vemos si es necesario escalar
}, 10000);

var checkInterval = setInterval(function(){log("#Chats (including replicas): " + chatLocation.length);}, 10000);

io.on("connection", (socket) => {
  conexiones++
    log(socket.handshake.query.type + " connected");

    if (socket.handshake.query.type == 'nodo') {
      if (active) {
        socket.join('Nodos');
        const nodoUrl = socket.handshake.query.url;
        serverPort = Math.max(nodoUrl, serverPort);
        addNodo(socket.id, nodoUrl);
        assignNodeEvents(socket)
      } else {
        socket.disconnect(true);
        log("incoming node disconnected due to master inactivity");
      }
    } else if (socket.handshake.query.type == "backup") {
      manageActive(socket.handshake.query.active);
      assignBackupEvents(socket)
      if (!connectionToBackup)
        connectToAlternative("main-master", socket.handshake.query.url);
    } else if (socket.handshake.query.type == "main-master") {
      manageActive(socket.handshake.query.active);
      assignBackupEvents(socket);
    }
})

function assignNodeEvents(socket) {
  socket.on('added-nodo', (data) => {
    if(!nodos.has(data.socketId)){
      nodos.set(data.socketId, data.url)
    }
  })

  socket.on('added-chat', (data) => {
    const locationEntry = {
      chatID: data.chatID,
      nodo: data.url
    };
    chatLocation.push(locationEntry);
    synchronizeBackup("added-location", locationEntry);
    manageChatCopy(socket.id, data.chat, data.chatID);
  })

  socket.on('health-report', (data) => {
    addHealthReport(socket.id, data);
  })

  socket.on('make-copy', (data) => {
    manageChatCopy(socket.id, data.chat, data.chatID);
  })

  socket.on('can-shutdown', () => {
    if((nodos.size - shuttingDown.length) > 3){
      console.log('shutting down ', nodos.get(socket.id))
      socket.emit('shutdown');
      shuttingDown.push(nodos.get(socket.id));
    }
  })

  socket.on('copy-added', (data) => {
    const locationEntry = {
      chatID: data,
      nodo: nodos.get(socket.id)
    };
    chatLocation.push(locationEntry);
    synchronizeBackup("added-location", locationEntry);
  })

  socket.on("disconnect", () => {
    conexiones--
    let nodo = nodos.get(socket.id);
    log(nodo, ' disconnected')
    updateChats(nodo, socket.id);
    let index = shuttingDown.indexOf(nodo);
    if(index > -1)
      shuttingDown.splice(index, 1);
    else
      spawnNodo();
  })
}

socketMonitor.on('heartbeat', (msg) => {

  promiseList = [osu.cpu.usage()
      .then(cpuPercentage => {
          return cpuPercentage
      }), osu.mem.info()
          .then(info => {
              return info.usedMemMb
          }), osu.mem.info()
              .then(info => {
                  return info.freeMemPercentage
              })]

  Promise.all(promiseList).then(data => {

    socketMonitor.emit
      ('heartbeat', {
          'Nombre': osu.os.hostname(),
          'SocketID': socketMonitor.id,
          'Rol': 'Master',
          'CPUUsage': data[0] +'%',
          'MemUsed': data[1] + 'MB',
          'MemFree': data[2] + '%',
          'Conexiones':conexiones,
          'Time' : Date.now()-msg,
          'Port' : port,
          'Uptime' : Math.round(osu.os.uptime()/3600)
      })
  })
  
});

socketMonitor.on('heartbeat10', () => {
  promiseList = [osu.cpu.usage()
      .then(cpuPercentage => {
          return cpuPercentage
      }), osu.mem.info()
          .then(info => {
              return info.usedMemMb
          }), osu.mem.info()
              .then(info => {
                  return info.freeMemPercentage
              })]

  Promise.all(promiseList).then(data => {

    socketMonitor.emit
      ('heartbeat10', {
          'Nombre': osu.os.hostname(),
          'SocketID': socketMonitor.id,
          'Rol': 'Master',
          'CPUUsage': data[0] +'%',
          'MemUsed': data[1] + 'MB',
          'MemFree': data[2] + '%',
          'Conexiones':conexiones,
          'Uptime' : Math.round(osu.os.uptime()/3600)

      })
  })
  
});


http.listen(port, () => log("Server on port: " + port));
