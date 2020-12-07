fs = require('fs');
const path = require('path');
const express = require('express');
const del = require('del');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var info;

app.use(express.static(path.join(__dirname, './front/build')));


if (fs.existsSync('./logs')) {
  (async () => {
    try {
        await del('./logs');

        console.log(` is deleted!`);
    } catch (err) {
        console.error(`Error while deleting`);
    }
})();
}

if (!fs.existsSync('./Permanentlogs')) {
  fs.mkdir(path.join(__dirname, 'Permanentlogs'), (err) => {
    if (err) {
      return console.error(err);
    }
  });

  fs.writeFile('./Permanentlogs/Master.txt', 'Fecha,Nombre,SocketID,CpuUsage,MemUsed,MemFree,Conexiones Actuales,upTime'+'\n',{ flag: 'wx' }, function (err) {
    if (err) return console.log(err);
  });
  fs.writeFile('./Permanentlogs/Server.txt', 'Fecha,Nombre,SocketID,CpuUsage,MemUsed,MemFree,Conexiones Actuales,upTime'+'\n', { flag: 'wx' },function (err) {
    if (err) return console.log(err);
  });
  fs.writeFile('./Permanentlogs/Loads.txt', 'Fecha,Nombre,SocketID,CpuUsage,MemUsed,MemFree,Conexiones Actuales,upTime'+'\n',{ flag: 'wx' }, function (err) {
    if (err) return console.log(err);
  });

}


io.on('connection', (socket) => {

  console.log(socket.id)
  socket.on('heartbeat', (msg) => {

    info = msg;

    if (!fs.existsSync('./logs')) {
      fs.mkdirSync(path.join(__dirname, 'logs'), (err) => {
        if (err) {
          return console.error(err);
        }
      });
    }
    fs.writeFileSync('./logs/' + info.Rol + '_log_' + info.Nombre + '_' + socket.id + '_' + '.txt',
      JSON.stringify(info), function (err) {
        if (err) return console.log(err);
      });

  });


  socket.on('heartbeat10', (msg) => {

    info = msg;

    const date = new Date();
    fs.appendFile('./Permanentlogs/' + info.Rol + '.txt',
      date.toISOString().toString() + ',' + info.Nombre + ',' + socket.id
      + ',' + info.CPUUsage + ',' + info.MemUsed + ',' + info.MemFree + ',' + info.Conexiones + ',' + info.Uptime+'hr'+'\n', function (err) {
        if (err) return console.log(err);
      });

  });


  socket.on('disconnect', (reason) => {


    fs.readdir('./logs', function (err, files) {
      if (err) {
        return console.log('Unable to scan directory1: ' + err);
      }
      const fileToDelete = files.find(file => file.includes(socket.id));
      if(fileToDelete!=undefined){
        fs.unlinkSync('./logs/' + fileToDelete, function (err) {
          if (err) return console.log(err);
        });
      }

    });
  });
});

setInterval(function () {

  io.emit('heartbeat',Date.now());

}, 1000);

setInterval(function () {

  io.emit('heartbeat10');

}, 10000);


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'front/build', 'index.html'));
});

app.get('/status', (req, res) => {

  if (fs.existsSync('./logs')) {

    fs.readdir('./logs', function (err, files) {
      //handling error
      if (err) {
        return console.log('Unable to scan directory: ' + err);
      }

      

      const values = files.map(file => {

      

        const value = fs.readFileSync('./logs/' + file, 'utf8', function (err, data) {
          if (err) {
            return 'error';
          }
          return data
        })

        if (value != 'error') {
          return ({
            'nombre': file,
            'value': JSON.parse(value)
          })

        }

      });

      res.json(values)

    });

  }

})

app.get('/history', (req, res) => {
  const rol = req.query.rol;
  console.log(rol);

  const value = fs.readFileSync('./Permanentlogs/' + rol + '.txt', 'utf8', function (err, data) {
    if (err) {
      return err
    }
    return data;
  })
  res.json(value);

});

http.listen(5005, () => {
  console.log('listening on *:5005');
});