const http = require("http").createServer();
const redis = require('socket.io-redis');
const io = require("socket.io")(http);
const { nanoid } = require("nanoid");
const args = process.argv;
const port = args[2];
const log = console.log;
const socketIO = require("socket.io-client");
io.adapter(redis({
    host: "127.0.0.1",
    port: 6379
}));

let balancerURL = "http://localhost:4001";
let balancerURLBackup = "http://localhost:4002";

const chats = new Map();
// {key: 4 character nanoid, value: {
//                                      messages: Map{key: timestamp, value: {message, username}},
//                                      users: Map{key: username, value: isAdmin},
//                                      isGroup: Boolean}
//                                  }

const users = new Map();
// {key: username, value: socket id}

/*  ******************
    Auxiliar functions
    ******************  */

function generateID() {
    return nanoid(4);
}

function getMapKeys(map) {
    return [... map.keys()];
}

function getUniqueChats(chats) {
    const unique = [];
    chats.forEach(chat => {
        if (!unique.some(otherChat => chat.id === otherChat.id))
            unique.push(chat);
    });
    return unique;
}

/*  ********************************************
    Node state management and querying functions
    ********************************************  */

function registerUser(username, id) {
    users.set(username, id);
}

function isChatMember(chatID, username) {
    const chat = chats.get(chatID);
    return chat.users.has(username);
}

function isPrivateChat(chatID, username, otherUsername) {
    const chat = chats.get(chatID);
    return !chat.isGroup && isChatMember(chatID, username) && isChatMember(chatID, otherUsername);
}

function getPrivateChat(username, otherUsername) {
    let privateChat;
    if (username === otherUsername)
        privateChat = [... chats].find(([id, chat]) => isPrivateChat(id, username, otherUsername) && chat.users.size === 1);
    else
        privateChat = [... chats].find(([id, _]) => isPrivateChat(id, username, otherUsername));
    return privateChat ? privateChat[0] : null;
}

function createPrivateChat(users) {
    const id = generateID();
    const chat = {
        messages: new Map(),
        users: new Map(),
        isGroup: false
    }
    users.forEach(user => chat.users.set(user, false));
    chats.set(id, chat);
    return id;
}

function createGroupChat(username) {
    const id = generateID();
    const chat = {
        messages: new Map(),
        users: new Map(),
        isGroup: true
    }
    chat.users.set(username, true);
    chats.set(id, chat);
    return id;
}

function addUserToChat(username, chatID) {
    const chat = chats.get(chatID);
    chat.users.set(username, false);
}

function notifyUser(motive, username, otherUsername, chatID, data) {
    const socketID = users.get(otherUsername);
    io.to(socketID).emit(motive, {
        username: username,
        id: chatID,
        data: data
    });
}

function inviteUserToGroupChat(username, otherUsername, chatID) {
    addUserToChat(otherUsername, chatID);
    notifyUser("chat-group-invite", username, otherUsername, chatID);
}

function getUserChats(username) {
    const userChats = [... chats].filter(([id, chat]) => isChatMember(id, username))
    return userChats.map(([id, chat]) => {return {
        id: id,
        users: getMapKeys(chat.users),
        group: chat.isGroup
    }});
}

function isEmpty(collection) {
    return collection.length === 0 || collection.size === 0;
}

function getEnvelopes(messages) {
    return messages.map(([timestamp, data]) => {
        const envelope = {
            timestamp: timestamp,
            username: data.username,
            message: data.message
        }
        return envelope;
    })
}

function saveMessage(room, envelope) {
    const message = {
        message: envelope.message,
        username: envelope.username
    }
    const chat = chats.get(room);
    chat.messages.set(envelope.timestamp, message);
}

function canJoinChat(username, chatID) {
    const chat = chats.get(chatID);
    return chat && isChatMember(chatID, username);
}

function connectedToRoom(id, username) {
    const socket = io.sockets.connected[users.get(username)];
    const rooms = Object.keys(socket.rooms);
    return rooms.includes(id);
}

function isGroupAdmin(chatID, username) {
    const chat = chats.get(chatID);
    return chat.users.get(username);
}

function removeUserFromGroupChat(username, otherUsername, chatID) {
    const chat = chats.get(chatID);
    chat.users.delete(otherUsername);
    if (askForUserConnected(otherUsername))
        notifyUser("chat-group-remove", username, otherUsername, chatID);
}

function setPrivilege(adminStatus, otherUsername, username, chatID) {
    const chat = chats.get(chatID);
    chat.users.set(otherUsername, adminStatus);
    if (askForUserConnected(otherUsername))
        notifyUser("chat-group-privilege", username, otherUsername, chatID, {admin: adminStatus});
}

function isMessageOwner(chatID, timestamp, username) {
    const chat = chats.get(chatID);
    const envelope = chat.messages.get(timestamp);
    return (envelope && envelope.username === username);
}

function messageExists(envelope) {
    const chat = chats.get(envelope.chatID);
    return chat.messages.has(envelope.timestamp);
}

function canEditMessage(username, envelope) {
    const chatID = envelope.chatID;
    const timestamp = envelope.timestamp;
    return isChatMember(chatID, username) && messageExists(envelope) && (isGroupAdmin(chatID, username) || (isMessageOwner(chatID, timestamp, username)))
}

function editMessage(newEnvelope) {
    const chat = chats.get(newEnvelope.chatID);
    const envelope = chat.messages.get(newEnvelope.timestamp);
    envelope.message = newEnvelope.message;
}

function deleteMessage(envelope) {
    const chat = chats.get(envelope.chatID);
    return chat.messages.delete(envelope.timestamp);
}

function isUserConnected(username) {
    return users.has(username);
}

function getChatMessages(chatID) {
    const chat = chats.get(chatID);
    if (chat) {
        let envelopes = getEnvelopes([ ...chat.messages]);
        return envelopes;
    }
    return null;
}

function sendUserInvitation(username, otherUsername, chatID) {
    let success = false;
    if (isUserConnected(otherUsername)) {
        notifyUser("chat-invite", username, otherUsername, chatID);
        success = true;
    }
    return success;
}

function isChatHere(chatID) {
    return chats.has(chatID);
}

function registerMessage(chatID, envelope) {
    io.to(chatID).emit("message", envelope);
    saveMessage(chatID, envelope);
}

function treatMessage(chatID, envelope) {
    let success = false
    if (isChatHere(chatID)) {
        registerMessage(chatID, envelope);
        success = true;
    }
    return success;
}

/*  **********************************************  
    Functionality to request data from other nodes
    **********************************************  */  

const reqType = {
    USEREXISTS: 0,
    PRIVATECHAT: 1,
    CHATMESSAGES: 2,
    INVITEUSER: 3,
    MESSAGE: 4,
    USERCHATS: 5
}

//customHook will handle and reply to any customRequest from other nodes
io.of('/').adapter.customHook = (data, callback) => {
    switch (data.type) {
        case reqType.USEREXISTS: callback(isUserConnected(data.username)); break;
        case reqType.PRIVATECHAT: callback(getPrivateChat(data.username, data.otherUsername)); break;
        case reqType.CHATMESSAGES: callback(getChatMessages(data.chatID)); break;
        case reqType.INVITEUSER: callback(sendUserInvitation(data.username, data.otherUsername, data.chatID)); break;
        case reqType.MESSAGE: callback(treatMessage(data.chatID, data.envelope)); break;
        case reqType.USERCHATS: callback(getUserChats(data.username)); break;
        default: callback(null);
    }
}

// data: {
//    type: reqType.AnyRequest,
//    field1: ...,
//    field2: ...,
//    ...
// }

function requestNodes(data) {
    return new Promise((resolve, reject) => {
        io.of('/').adapter.customRequest(data, (err, responses) => {
        if (err) 
            reject(err);
        else 
            resolve(responses);
        });
    });
}

function getFirstValidResponse(responses) {
    return responses.find(elem => elem);
}

function getValidResponses(responses) {
    return responses.filter(elem => elem);
}

function askForUserConnected(username) {
    return new Promise((resolve, reject) => {
        if (isUserConnected(username))
            resolve(true);
        else {
            const data = {
                type: reqType.USEREXISTS,
                username: username
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })
        }
    });
}

function askForPrivateChat(username, otherUsername) {
    return new Promise((resolve, reject) => {
        let chatID = getPrivateChat(username, otherUsername);
        if (chatID)
            resolve(chatID);
        else {
            const data = {
                type: reqType.PRIVATECHAT,
                username: username,
                otherUsername: otherUsername
            }
            requestNodes(data).then(responses => {
                chatID = getFirstValidResponse(responses);
                resolve(chatID);
            }).catch((reason) => {
                reject(reason);
            })
        }
    });
}

function askForChatMessages(chatID) {
    return new Promise((resolve, reject) => {
        let messages = getChatMessages(chatID);
        if (messages)
            resolve(messages);
        else {
            const data = {
                type: reqType.CHATMESSAGES,
                chatID: chatID
            }
            requestNodes(data).then(responses => {
                messages = getFirstValidResponse(responses);
                resolve(messages);
            }).catch((reason) => {
                reject(reason);
            })
        }
    });
}

function askForUserInvitation(username, otherUsername, chatID) {
    return new Promise((resolve, reject) => {
        if (isUserConnected(otherUsername)) {
            notifyUser("chat-invite", username, otherUsername, chatID);
            resolve(true);
        } else {
            const data = {
                type: reqType.INVITEUSER,
                username: username,
                otherUsername: otherUsername,
                chatID: chatID
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })
        }
    });
}

function askForMessageTreatment(chatID, envelope) {
    return new Promise((resolve, reject) => {
        if (isChatHere(chatID)) {
            registerMessage(chatID, envelope);
            resolve(true);
        } else {
            const data = {
                type: reqType.MESSAGE,
                chatID: chatID,
                envelope: envelope
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })
        }
    });
}

function askForUserChats(username) {
    return new Promise((resolve, reject) => {
        const localChats = getUserChats(username);
        const data = {
            type: reqType.USERCHATS,
            username: username
        }
        requestNodes(data).then(responses => {
            const externalChats = getValidResponses(responses).flat();
            const chats = getUniqueChats(localChats.concat(externalChats));
            resolve(chats);
        }).catch((reason) => {
            reject(reason);
        })
    });
}

/*  **************************
    Event management functions
    **************************  */

function authorizeUser(socket, username) {
    const authorization = {
        username: username,
        authorized: false
    }
    askForUserConnected(username).then((connected) => {
        if (!connected) {
            log(username + " connected");
            registerUser(username, socket.id);
            socket.username = username;
            socket.authorized = authorization.authorized = true;
        } else {
            log(username + " was already connected");
        }
        socket.emit("authorization", authorization);
    }).catch((reason) => {
        log(reason);
        socket.emit("authorization", authorization);
    });
}

function managePrivateChat(socket, otherUsername) {
    const username = socket.username;
    askForUserConnected(otherUsername).then((connected) => {
        if (!connected) {
            log(otherUsername + " wasn't found anywhere");
            socket.emit("chat-with", null);
        } else {
            askForPrivateChat(username, otherUsername).then((chatID) => {
                if (!chatID)
                    chatID = createPrivateChat([username, otherUsername]);
                socket.join(chatID);
                socket.emit("chat-with", chatID);
                sendChatMessages(username, chatID);
                inviteUserToChat(username, otherUsername, chatID);
            }).catch(reason => {
                log(reason);
                socket.emit("chat-with", null);
            })
        }
    }).catch((reason) => {
        log(reason);
        socket.emit("chat-with", null);
    });
}

function manageMessage(chatID, envelope) {
    askForMessageTreatment(chatID, envelope).then((success) => {
        if (success)
            log("Message " + envelope.timestamp + " saved");
        else
            log("Message " + envelope.timestamp + " couldn't be saved");
    }).catch((reason) => {
        log(reason);
    });
}

function manageUserChats(socket) {
    const username = socket.username;
    askForUserChats(username).then((chats) => {
        socket.emit("query-chats", chats);
    }).catch((reason) => {
        log(reason);
    });
}



/*  ********************************
    Functions for chat interactivity
    ********************************  */

function sendChatMessages(username, chatID) {
    const socketID = users.get(username);
    askForChatMessages(chatID).then(messages => {
        if (messages)
            io.to(socketID).emit("messages", messages);
    }).catch(reason => {
        log(reason);
    })
}

function inviteUserToChat(username, otherUsername, chatID) {
    askForUserInvitation(username, otherUsername, chatID).then(success => {
        if (success)
            log(username + " invited " + otherUsername + " to " + chatID);
        else
            log(username + " wanted to invite " + otherUsername + " to " + chatID + " but failed");
    }).catch(reason => {
        log(reason);
    })
}

/*  *********************************
    Event listeners to attend clients
    *********************************  */

io.on("connection", (socket) => {

    socket.on("login", (username) => {
        authorizeUser(socket, username);
    })

    socket.on("message", (data) => {
        log(data);
        const envelope = {
            timestamp: Date.now(),
            message: data.message,
            username: socket.username
        }
        manageMessage(data.room, envelope)
    })

    //ToDo PubSub adaptation
    socket.on("secure-message", (data) => {
        log(data);
        const envelope = {
            timestamp: Date.now(),
            message: data.message,
            username: socket.username,
            chatID: data.room
        }
        io.to(data.room).emit("message", envelope);
        saveMessage(data.room, envelope);
        setTimeout(() => {
            if (deleteMessage(envelope))
                io.to(data.room).emit("deleted-message", envelope);
        }, data.timeout * 1000);
    })

    //ToDo PubSub adaptation
    socket.on("edit-message", (envelope) => {
        log(username + " wants to edit message " + envelope.timestamp);
        const canEdit = canEditMessage(socket.username, envelope);
        if (canEdit) {
            editMessage(envelope);
            socket.to(envelope.chatID).emit("edited-message", envelope);
        }
        socket.emit("edit-message", canEdit);
    })

    //ToDo PubSub adaptation
    socket.on("delete-message", (envelope) => {
        log(socket.username + " wants to delete message " + envelope.timestamp);
        const canDelete = canEditMessage(socket.username, envelope);
        if (canDelete) {
            deleteMessage(envelope);
            socket.to(envelope.chatID).emit("deleted-message", envelope);
        }
        socket.emit("delete-message", canDelete);
    })

    socket.on("chat-with", (otherUsername) => {
        log(socket.username + " wants to chat with " + otherUsername);
        managePrivateChat(socket, otherUsername);
    })

    //ToDo PubSub adaptation
    socket.on("create-group", () => {
        log(socket.username + " wants to create a group");
        let chatID = createGroupChat(socket.username);
        socket.join(chatID);
        socket.emit("create-group", chatID);
    })

    //ToDo PubSub adaptation
    socket.on("invite-to-group", (groupInvite) => {
        const chatID = groupInvite.chatID;
        const otherUsername = groupInvite.username;
        log(socket.username + " wants to invite to group " + otherUsername);
        const canInvite = askForUserConnected(otherUsername) && isGroupAdmin(chatID, socket.username) && !isChatMember(chatID, otherUsername);
        if (canInvite)
            inviteUserToGroupChat(socket.username, otherUsername, chatID);
        socket.emit("invite-to-group", canInvite);
    })

    //ToDo PubSub adaptation
    socket.on("remove-from-group", (groupRemove) => {
        const chatID = groupRemove.chatID;
        const otherUsername = groupRemove.username;
        log(socket.username + " wants to remove from group " + otherUsername);
        const canRemove = isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, socket.username);
        if (canRemove)
            removeUserFromGroupChat(socket.username, otherUsername, chatID);
        socket.emit("remove-from-group", canRemove);
    })

    //ToDo PubSub adaptation
    socket.on("privilege", (permission) => {
        const otherUsername = permission.username;
        const adminStatus = permission.admin ;
        const chatID = permission.chatID;
        log(socket.username + " wants to set privilege to " + otherUsername);
        const canSetPrivilege = isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, socket.username) && isGroupAdmin(chatID, otherUsername) !== adminStatus;
        if (canSetPrivilege)
            setPrivilege(adminStatus, otherUsername, socket.username, chatID);
        socket.emit("privilege", canSetPrivilege);
    })

    //ToDo PubSub adaptation
    socket.on("join-chat", (id) => {
        log(socket.username + " wants to join chat " + id);
        const availableChat = canJoinChat(socket.username, id);

        socket.emit("join-chat", {
            available: availableChat,
            id: id
        });

        if (availableChat)  {
            socket.join(id);
            sendChatMessages(socket.username, id);
        }
    })

    socket.on("query-chats", () => {
        log(socket.username + " wants to know his chats ");
        manageUserChats(socket);
    })

    socket.on("leave-chat", (id) => {
        log(socket.username + " wants to leave chat " + id);
        socket.leave(id);
    })

    socket.on("logoff", () => {
        if (socket.authorized) {
            users.delete(socket.username);
            Object.values(socket.rooms).forEach(room => {
                if (room !== socket.id)
                    socket.leave(room)
            });
            log(socket.username + " logged off");
        }
    })

    socket.on("disconnect", () => {
        if (socket.authorized) {
            users.delete(socket.username);
            log(socket.username + " disconnected");
        }
    })
})

/*  ***********************
    Connection to balancers
    ***********************  */

let connection;

let opts = {
       reconnection: true,
       query: { type: 'nodo', url: port }
   }

connection = socketIO(balancerURL, opts)

assingEvents(connection);

function assingEvents(socket){
  socket.on('connect_error', function (err) {
      console.log('connecting to another balancer');
      socket.disconnect();
      setTimeout(() => {
        socket = connection = socketIO(balancerURLBackup, opts);
        let server = balancerURL;
        balancerURL = balancerURLBackup;
        balancerURLBackup = server;
        assingEvents(socket);
      //  connection.reconnectBalancer = false;
      }, 1500);

  });
}

http.listen(port, () => log("Server listening on port: " + port));
