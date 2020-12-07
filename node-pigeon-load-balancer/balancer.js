
const http = require("http").createServer();
const io = require("socket.io")(http);
const socketIO = require("socket.io-client");
var balancerURL = "http://localhost:";
const args = process.argv;
const port = args[2];
const portMainBalancer = args[3];
var balancer = '';
const log = console.log;
let index = 0;
var osu = require('node-os-utils');
let conexiones =0;
const socketMonitor = socketIO('http://localhost:5005');

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

if(portMainBalancer){
  balancerURL = balancerURL + portMainBalancer;

  balancer = socketIO(balancerURL, {
       query: { type: 'balancer'}
   });

  assingEvents(balancer);
}

function assingEvents(socket){
  socket.on('added-nodo', (data) => {
     console.log(data);
      if(!nodos.has(data.socketId)){
        nodos.set(data.socketId, data.url)
      }
  })

  socket.on('deleted-nodo', (data) => {
    if(nodos.has(data.socketId)){
      nodos.delete(data.socketId);
      console.log('deleted', data.socketId)
    }
  })


  socket.on('initial-nodes', (data) => {
    [... data].forEach(([k,v]) => {
      if(!nodos.has(k)){
        nodos.set(k,v);
      }
    })
    console.log(nodos);
  })

  socket.on('request-nodes', () => {
    socket.emit('initial-nodes', [...nodos]);
  });
}

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
  conexiones++
    console.log(socket.handshake);

    if(socket.handshake.query.type == 'nodo'){
    	const nodoUrl = socket.handshake.query.url;
      addNodo(socket.id, nodoUrl);
      if(balancer != ''){
        log('enviando nodo al balancer')
        balancer.emit('added-nodo', {socketId: socket.id, url: nodoUrl});
      }
    }else if(socket.handshake.query.type == 'balancer'){
      balancer = socket;
      if(nodos.size > 0) {
        socket.emit('initial-nodes',[...nodos]);
      }else {
        socket.emit('request-nodes');
      }
    }
    else{
      let nodo = selectNodo();
      if(nodo == null){
        nodo = selectNodo();
      }
    	socket.emit('nodo', nodo);
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
      increaseIndex();
    })

    socket.on("disconnect", () => {
      conexiones--
      nodos.delete(socket.id);
    })
})

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
          'Rol': 'Loads',
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
          'Rol': 'Loads',
          'CPUUsage': data[0] +'%',
          'MemUsed': data[1] + 'MB',
          'MemFree': data[2] + '%',
          'Conexiones':conexiones,
          'Uptime' : Math.round(osu.os.uptime()/3600)

      })
  })
  
});


http.listen(port, () => log("Server on port: " + port));
