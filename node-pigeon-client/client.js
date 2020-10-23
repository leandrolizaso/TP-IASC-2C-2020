const serverURL = "http://localhost:3000";
const socketIO = require("socket.io-client");
const chalk = require("chalk");  
const lineReader = require("serverline")
const connection = {socket: null, username: null, room: null};
 
lineReader.init()
lineReader.setCompletion(["/help", "/login", "/chat", "/join", "/chats", "/leave", "/logoff"])
lineReader.setPrompt(getPrompt());
welcome();

function welcome() {
  console.log(chalk.green("Welcome to Pigeon client, type " + chalk.whiteBright("/help") + " to see available commands"));
}

function getPrompt() {
  return chalk.cyanBright("> ");
}

function getWords(str) {
  return str.split(" ");
}

function connectToServer(username) {
  return socketIO(serverURL, {
    query: { username: username }
  })
}

function send(event, data) {
  connection.socket.emit(event, data);
}

function login(username) {
  connection.socket = connectToServer(username);
  connection.username = username;
  addConnectionEvents();
}

function joinChat(id) {
  send("join-chat", id);
}

function chatWith(username) {
  send("chat-with", username);
}

function showChats() {
  send("query-chats");
}

function leaveChat() {
  send("leave-chat", connection.room);
  connection.room = null;
  console.log(chalk.yellow("Chat left successfully"));
}

function setToDefaultConnection() {
  connection.socket.disconnect();
  connection.username = null;
  connection.room = null;
}

function disconnect() {
  setToDefaultConnection();
  console.log(chalk.magenta("Logged off!"));
}

function loggedIn() {
  return connection.username !== null;
}

function connectedToRoom() {
  return connection.room !== null;
}

function sendMessage(message) {
  const cleanMessage = message.split("\n")[0];
  console.log(chalk.gray(connection.username) + ": " + cleanMessage);
  send("message", {
    message: cleanMessage,
    room: connection.room
  })
}

function isEmpty(array) {
  return array.length === 0;
}

const stdRL = lineReader.getRL();
stdRL._writeToOutput = (function(write) {
  return function _writeToOutput(argStringToWrite) {
    let stringToWrite = argStringToWrite
    
    if (stringToWrite[stringToWrite.length-1] === "\n" && connectedToRoom())
      stringToWrite = "";

    write.call(stdRL, stringToWrite)
  }
})(stdRL._writeToOutput)

lineReader.on("line", function(line) {

  const words = getWords(line);
  const cmd = words[0] || "";
  const parameter1 = words[1] || "";

  if (connectedToRoom() && line[0] !== "/") {
    sendMessage(line);
    return;
  }

  switch (cmd) {
    case "/help":
      console.log(chalk.yellow("/login [username]") + ": logs in with specified username");
      console.log(chalk.yellow("/chat [username]") + ": start chatting with username");
      console.log(chalk.yellow("/join [id]") + ": joins a chat by its identifier");
      console.log(chalk.yellow("/chats") + ": shows your chats");
      console.log(chalk.yellow("/leave") + ": leaves current chat");
      console.log(chalk.yellow("/logoff") + ": logs off from current user");
      break;
    case "/login":
      if (!loggedIn())
        login(parameter1)
      else
        console.log(chalk.red("You must first /logoff to log in again."))
      break;
    case "/chat":
      if (loggedIn() && !connectedToRoom())
        chatWith(parameter1);
      else
        console.log(chalk.red("Couldn't execute that command. Not logged in or already chatting."))
      break;
    case "/join":
      if (loggedIn())
        joinChat(parameter1);
      else
        console.log(chalk.red("Couldn't execute that command. Not logged in."))
      break;
    case "/chats":
      if (loggedIn())
        showChats();
      else
        console.log(chalk.red("You must first /login to query your chats."))
      break;
    case "/leave":
      if (loggedIn() && connectedToRoom())
        leaveChat();
      else
        console.log(chalk.red("Couldn't execute that command. There's no active chat."));
      break;
    case "/logoff":
      if (loggedIn())
        disconnect();
      else
        console.log(chalk.red("You must be logged in."))
      break;
    default:
      console.log(chalk.red("Unknown command. Please type /help for more information."));
  }
})
 
lineReader.on("SIGINT", function(rl) {
  rl.question("Do you really want to quit? (y/n): ", (answer) => {
    if (answer.match(/^y(es)?$/i)) {
      console.log(chalk.whiteBright("Bye!"));
      process.exit(0);
    }
    rl.output.write(getPrompt());
  });
})

function addSocketEvent(eventName, callback) {
  connection.socket.on(eventName, callback);
}

function addConnectionEvents() {
  addSocketEvent("authorization", (alreadyLogged) => {
    if (!alreadyLogged) {
      console.log(chalk.green("Login success"));
      username = connection.socket.io.opts.query.username;
      addChatEvents();
    } else {
      console.log(chalk.red("User is already logged in!"));
      setToDefaultConnection();
    }
  })

  addSocketEvent("reconnecting", (reason) => {
    if (reason !== "io client disconnect")
      console.log(chalk.red("Network error. Retrying connection..."));
  })

  addSocketEvent("reconnect", () => {
    connection.socket.off();
    addConnectionEvents();
    if (connection.room) {
      joinChat(connection.room);
      connection.room = null;
    }
  })
}

function addChatEvents() {
  addSocketEvent("message", (envelope) => {
    const { message, username } = envelope;
    console.log(chalk.blueBright(username) + ": " + message);
  })

  addSocketEvent("chat-with", (chatID) => {
    if (chatID) {
      connection.room = chatID;
      console.log(chalk.yellow("Joined to chat #" + chatID));
    } else
      console.log(chalk.red("User is not connected, couldn't send invitation."));
  })

  addSocketEvent("join-chat", (result) => {
    if (result.available) {
      if (connectedToRoom())
        leaveChat();
      console.log(chalk.green("Joined to chat #" + result.id));
      connection.room = result.id;
    } else {
      console.log(chalk.red("Couldn't join that chat"));
    }
  })

  addSocketEvent("query-chats", (chats) => {
    if (isEmpty(chats))
      console.log(chalk.red("No chats found"));
    else
      chats.forEach(chat => {
        const [user, anotherUser] = chat.users;
        console.log(chalk.yellow(chat.id + " - " + "Chat between " + user + " & " + anotherUser));
      })
  })

  addSocketEvent("chat-invite", (invite) => {
    if (invite.username !== connection.username)
      console.log(chalk.yellow(invite.username + " invited you to join a private chat. Type ") +
                  chalk.whiteBright("/join " + invite.id) +
                  chalk.yellow(" or ") +
                  chalk.whiteBright("/chat " + invite.username));
  })

  addSocketEvent("messages", (envelopes) => {
    envelopes.forEach(envelope => {
      if (envelope.username === connection.username)
        console.log(chalk.gray(envelope.username) + ": " + envelope.message);
      else
        console.log(chalk.blueBright(envelope.username) + ": " + envelope.message);
    })
  })
}

  
