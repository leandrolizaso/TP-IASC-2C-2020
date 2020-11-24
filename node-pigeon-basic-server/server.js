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
let master = "http://localhost:5000";
let masterBackup = "http://localhost:5001";

let messagesCont = 0;

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

function serializeChat(chat) {
    const serialized = {};
    serialized.messages = [ ...chat.messages];
    serialized.users = [ ...chat.users];
    serialized.isGroup = chat.isGroup;
    return serialized;
}

function deserializeChat(serialized) {
    const chat = {};
    chat.messages = new Map(serialized.messages);
    chat.users = new Map(serialized.users);
    chat.isGroup = serialized.isGroup;
    return chat;
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
    let removed = false;
    if (chat) {
        if (isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, username)) {
            removed = chat.users.delete(otherUsername);
        }
    }
    return removed;
}

function setPrivilege(adminStatus, otherUsername, username, chatID) {
    let success = false;
    if (isChatHere(chatID)) {
        const canSetPrivilege = isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, username) && isGroupAdmin(chatID, otherUsername) !== adminStatus;
        if (canSetPrivilege) {
            const chat = chats.get(chatID);
            chat.users.set(otherUsername, adminStatus);
            success = true;
        }
    }
    return success;
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

function deleteMessage(chatID, envelope) {
    const chat = chats.get(chatID);
    return chat.messages.delete(envelope.timestamp);
}

function canInviteToGroup(username, otherUsername, chatID) {
    return isGroupAdmin(chatID, username) && !isChatMember(chatID, otherUsername);
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

function sendInvitation(username, invite) {
    let success = false;
    if (isUserConnected(invite.username)) {
        let inviteType = invite.group ? "chat-group-invite" : "chat-invite";
        notifyUser(inviteType, username, invite.username, invite.chatID);
        success = true;
    }
    return success;
}

function isChatHere(chatID) {
    return chats.has(chatID);
}

function registerMessage(chatID, envelope) {
    saveMessage(chatID, envelope);
    if (envelope.expires)
        setTimeout(() => {
            if (deleteMessage(chatID, envelope))
                io.to(chatID).emit("deleted-message", envelope);
        }, envelope.expires);
    //What if node falls when this timer is still up?
    //In that case, other nodes who have this chat should realize it and manage secure messages again
}

function treatMessage(chatID, envelope) {
    let success = false;
    if (isChatHere(chatID)) {
        registerMessage(chatID, envelope);
        success = true;
    }
    return success;
}

function treatMessageEdit(username, envelope) {
    let success = false;
    if (isChatHere(envelope.chatID)) {
        const canEdit = canEditMessage(username, envelope);
        if (canEdit) {
            editMessage(envelope);
            success = true;
        }
    }
    return success;
}

function treatMessageDelete(username, envelope) {
    let success = false;
    if (isChatHere(envelope.chatID)) {
        const canDelete = canEditMessage(username, envelope);
        if (canDelete) {
            success = deleteMessage(envelope.chatID, envelope);
        }
    }
    return success;
}

function treatGroupAdd(username, invite) {
    let success = false;
    if (isChatHere(invite.chatID)) {
        const canInvite = canInviteToGroup(username, invite.username, invite.chatID)
        if (canInvite) {
            addUserToChat(invite.username, invite.chatID);
            success = true;
        }
    }
    return success;
}

function sendNotification(username, otherUsername, chatID, type, data) {
    let success = false;
    if (isUserConnected(otherUsername)) {
        notifyUser(type, username, otherUsername, chatID, data);
        success = true;
    }
    return success;
}

function menssagesInChat() {
//  let simpleChats = [];
//  Array.from(chats.values()).forEach(c => simpleChats.push(c.messages.size));
//  return simpleChats.reduce((c1, c2) => c1 + c2, 0);
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
    USERCHATS: 5,
    EDITMESSAGE: 6,
    DELETEMESSAGE: 7,
    GROUPADD: 8,
    CANJOINCHAT: 9,
    DELETEFROMGROUP: 10,
    SETPRIVILEGE: 11,
    NOTIFYUSER: 12
}

//customHook will handle and reply to any customRequest from other nodes
io.of('/').adapter.customHook = (data, callback) => {
    switch (data.type) {
        case reqType.USEREXISTS: callback(isUserConnected(data.username)); break;
        case reqType.PRIVATECHAT: callback(getPrivateChat(data.username, data.otherUsername)); break;
        case reqType.CHATMESSAGES: callback(getChatMessages(data.chatID)); break;
        case reqType.INVITEUSER: callback(sendInvitation(data.username, data.invite)); break;
        case reqType.MESSAGE: callback(treatMessage(data.chatID, data.envelope)); break;
        case reqType.USERCHATS: callback(getUserChats(data.username)); break;
        case reqType.EDITMESSAGE: callback(treatMessageEdit(data.username, data.envelope)); break;
        case reqType.DELETEMESSAGE: callback(treatMessageDelete(data.username, data.envelope)); break;
        case reqType.GROUPADD: callback(treatGroupAdd(data.username, data.invite)); break;
        case reqType.CANJOINCHAT: callback(canJoinChat(data.username, data.chatID)); break;
        case reqType.DELETEFROMGROUP: callback(removeUserFromGroupChat(data.username, data.otherUsername, data.chatID)); break;
        case reqType.SETPRIVILEGE: callback(setPrivilege(data.adminStatus, data.otherUsername, data.username, data.chatID)); break;
        case reqType.NOTIFYUSER: callback(sendNotification(data.username, data.otherUsername, data.chatID, data.notifyType, data.data)); break;
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

function askForUserInvitation(username, invite) {
    return new Promise((resolve, reject) => {
        if (isUserConnected(invite.username)) {
            resolve(sendInvitation(username, invite));
        } else {
            const data = {
                type: reqType.INVITEUSER,
                username: username,
                invite: invite
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
        }

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

function askForEditMessage(username, envelope) {
    return new Promise((resolve, reject) => {
        if (isChatHere(envelope.chatID)) {
            const canEdit = canEditMessage(username, envelope);
            if (canEdit)
                editMessage(envelope);
            resolve(canEdit);
        }
        const data = {
            type: reqType.EDITMESSAGE,
            username: username,
            envelope: envelope
        }
        requestNodes(data).then(responses => {
            resolve(responses.includes(true));
        }).catch((reason) => {
            reject(reason);
        })

    });
}

function askForDeleteMessage(username, envelope) {
    return new Promise((resolve, reject) => {
        if (isChatHere(envelope.chatID)) {
            const canDelete = canEditMessage(username, envelope);
            if (canDelete)
                deleteMessage(envelope.chatID, envelope);
            resolve(canDelete);
        }
        const data = {
            type: reqType.DELETEMESSAGE,
            username: username,
            envelope: envelope
        }
        requestNodes(data).then(responses => {
            resolve(responses.includes(true));
        }).catch((reason) => {
            reject(reason);
        })

    });
}

function askForGroupInvite(username, invite) {
    return new Promise((resolve, reject) => {
        askForUserConnected(invite.username).then(connected => {
            if (connected) {
                if (isChatHere(invite.chatID)) {
                    resolve(treatGroupAdd(username, invite));
                } else {
                    const data = {
                        type: reqType.GROUPADD,
                        username: username,
                        invite: invite
                    }
                    requestNodes(data).then(responses => {
                        resolve(responses.includes(true));
                    }).catch((reason) => {
                        reject(reason);
                    })
                }
            }
            else {
                resolve(false);
            }
        }).catch(reason => {
            reject(reason);
        })
    });
}

function askForCanJoinChat(username, chatID) {
    return new Promise((resolve, reject) => {
        if (isChatHere(chatID)) {
            resolve(canJoinChat(username, chatID));
        } else {
            const data = {
                type: reqType.CANJOINCHAT,
                username: username,
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

function askForRemoveUserFromGroupChat(username, otherUsername, chatID) {
    return new Promise((resolve, reject) => {
        if (isChatHere(chatID)) {
            resolve(removeUserFromGroupChat(username, otherUsername, chatID));
        }
            const data = {
                type: reqType.DELETEFROMGROUP,
                otherUsername: otherUsername,
                username: username,
                chatID: chatID
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })

    });
}

function askForSetPrivilege(adminStatus, otherUsername, username, chatID) {
    return new Promise((resolve, reject) => {
        if (isChatHere(chatID)) {
            resolve(setPrivilege(adminStatus, otherUsername, username, chatID));
        }
            const data = {
                type: reqType.SETPRIVILEGE,
                adminStatus: adminStatus,
                otherUsername: otherUsername,
                username: username,
                chatID: chatID
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })

    });
}

function askForUserNotification(username, otherUsername, chatID, notifyType, otherData) {
    return new Promise((resolve, reject) => {
        if (isUserConnected(otherUsername)) {
            resolve(sendNotification(username, otherUsername, chatID, notifyType, otherData));
        } else {
            const data = {
                type: reqType.NOTIFYUSER,
                username: username,
                otherUsername: otherUsername,
                chatID: chatID,
                notifyType: notifyType,
                data: otherData
            }
            requestNodes(data).then(responses => {
                resolve(responses.includes(true));
            }).catch((reason) => {
                reject(reason);
            })
        }
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
                if (!chatID){
                  chatID = createPrivateChat([username, otherUsername]);
                  connectionMaster.emit('added-chat', {chat: serializeChat(chats.get(chatID)), url: port, chatID: chatID});
                }
                socket.join(chatID);
                socket.emit("chat-with", chatID);
                sendChatMessages(username, chatID);
                const invite = {
                    username: otherUsername,
                    chatID: chatID,
                    group: false
                };
                inviteUserToChat(username, invite);
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
        if (success) {
            log("Message " + envelope.timestamp + " saved");
            io.to(chatID).emit("message", envelope);
        }
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

function manageEditMessage(socket, envelope) {
    const username = socket.username;
    askForEditMessage(username, envelope).then((success) => {
        if (success) {
            log("Message " + envelope.timestamp + " edited");
            socket.to(envelope.chatID).emit("edited-message", envelope);
        } else
            log("Message " + envelope.timestamp + " couldn't be edited");
        socket.emit("edit-message", success);
    }).catch((reason) => {
        log(reason);
    });
}

function manageDeleteMessage(socket, envelope) {
    const username = socket.username;
    askForDeleteMessage(username, envelope).then((success) => {
        if (success) {
            log("Message " + envelope.timestamp + " deleted");
            socket.to(envelope.chatID).emit("deleted-message", envelope);
        } else
            log("Message " + envelope.timestamp + " couldn't be deleted");
        socket.emit("delete-message", success);
    }).catch((reason) => {
        log(reason);
    });
}

function manageGroupInvite(socket, invite) {
    const username = socket.username;
    askForGroupInvite(username, invite).then((success) => {
        if (success) {
            log(invite.username + " was added to group " + invite.chatID);
            invite.group = true;
            inviteUserToChat(username, invite);
        } else
            log("Couldn't add user to group");
        socket.emit("invite-to-group", success);
    }).catch((reason) => {
        log(reason);
    });
}

function manageJoinChat(socket, chatID) {
    const username = socket.username;
    askForCanJoinChat(username, chatID).then((success) => {
        socket.emit("join-chat", {
            available: success,
            id: chatID
        });
        if (success) {
            socket.join(chatID);
            sendChatMessages(username, chatID);
        } else
            log(username + " couldn't join " + chatID);
    }).catch((reason) => {
        log(reason);
    });
}

function manageRemoveUserFromGroupChat(socket, otherUsername, chatID) {
    const username = socket.username;
    askForRemoveUserFromGroupChat(username, otherUsername, chatID).then((success) => {
        socket.emit("remove-from-group", success);
        if (!success)
            log(username + " couldn't remove " + otherUsername + "from " + chatID);
        else
            notifyUserInGroup(username, otherUsername, chatID, "chat-group-remove");
    }
  ).catch((reason) => {
        log(reason);
    });

}

function manageSetPrivilege(socket, otherUsername, adminStatus, chatID) {
    const username = socket.username;
    askForSetPrivilege(adminStatus, otherUsername, username, chatID).then((success) => {
        socket.emit("privilege", success);
        if (!success)
            log(username + " couldn't set privilege to " + otherUsername);
        else
        notifyUserInGroup(username, otherUsername, chatID, "chat-group-privilege", {admin: adminStatus});
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

function inviteUserToChat(username, invite) {
    askForUserInvitation(username, invite).then(success => {
        if (success)
            log(username + " invited " + invite.username + " to " + invite.chatID);
        else
            log(username + " wanted to invite " + invite.username + " to " + invite.chatID + " but failed");
    }).catch(reason => {
        log(reason);
    })
}

function notifyUserInGroup(username, otherUsername, chatID, type, data = null) {
    askForUserNotification(username, otherUsername, chatID, type, data).then(success => {
        if (success)
            log(username + " emitted " + type + " to " + otherUsername + " succesfully");
        else
            log(username + " tried to emit " + type + " to " + otherUsername + " but failed");
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
        messagesCont++;
        log(data);
        const envelope = {
            timestamp: Date.now(),
            message: data.message,
            username: socket.username
        }
        manageMessage(data.room, envelope)
    })

    socket.on("secure-message", (data) => {
        log(data);
        const envelope = {
            timestamp: Date.now(),
            message: data.message,
            username: socket.username,
            expires: data.timeout * 1000
        };
        manageMessage(data.room, envelope);
    })

    socket.on("edit-message", (editEnvelope) => {
        log(socket.username + " wants to edit message " + editEnvelope.timestamp);
        manageEditMessage(socket, editEnvelope);
    })

    socket.on("delete-message", (deleteEnvelope) => {
        log(socket.username + " wants to delete message " + deleteEnvelope.timestamp);
        manageDeleteMessage(socket, deleteEnvelope)
    })

    socket.on("chat-with", (otherUsername) => {
        log(socket.username + " wants to chat with " + otherUsername);
        managePrivateChat(socket, otherUsername);
    })

    socket.on("create-group", () => {
        log(socket.username + " wants to create a group");
        let chatID = createGroupChat(socket.username);
        connectionMaster.emit('added-chat', {chat: serializeChat(chats.get(chatID)), chatID: chatID, url: port});
        socket.join(chatID);
        socket.emit("create-group", chatID);
    })

    socket.on("invite-to-group", (invite) => {
        log(socket.username + " wants to invite to group " + invite.username);
        manageGroupInvite(socket, invite);
    })

    socket.on("remove-from-group", (groupRemove) => {
        const chatID = groupRemove.chatID;
        const otherUsername = groupRemove.username;
        log(socket.username + " wants to remove from group " + otherUsername);
        manageRemoveUserFromGroupChat(socket, otherUsername, chatID);
    })

    socket.on("privilege", (permission) => {
        const otherUsername = permission.username;
        const adminStatus = permission.admin ;
        const chatID = permission.chatID;
        log(socket.username + " wants to set privilege to " + otherUsername);
        manageSetPrivilege(socket, otherUsername, adminStatus, chatID);

    })

    socket.on("join-chat", (id) => {
        log(socket.username + " wants to join chat " + id);
        manageJoinChat(socket, id);
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

let connectionBalancer;
let connectionMaster;
let opts = {
       reconnection: true,
       query: { type: 'nodo', url: port }
   }

connectionBalancer = socketIO(balancerURL, opts);
connectionMaster = socketIO(master, opts);

assignBalancerEvents(connectionBalancer);
assignMasterEvents(connectionMaster);

function assignBalancerEvents(socket){
  socket.on('connect_error', function (err) {
      console.log('connecting to another balancer');
      socket.disconnect();
      setTimeout(() => {
        socket = connection = socketIO(balancerURLBackup, opts);
        let server = balancerURL;
        balancerURL = balancerURLBackup;
        balancerURLBackup = server;
        assignBalancerEvents(socket);
      }, 1500);

  });
}

function assignMasterEvents(socket){
    socket.on('health-check', function () {
        log("Sent health report (%i)", messagesCont);
        socket.emit('health-report', messagesCont);
        messagesCont = 0;
    });

    socket.on('add-chat-copy', function (data) {
        log("Received chat to replicate");
        log(data);
        chats.set(data.chatID, deserializeChat(data.chat));
        socket.emit('copy-added', data.chatID);
    });

    socket.on('send-copy', function (data) {
        log("Sent chat to replicate (%s)", data);
        socket.emit('make-copy', {chatID: data, chat: serializeChat(chats.get(data))})
    });

    socket.on("connect_error", () => {
        reconnectToAlternativeMaster(socket);
    })

    socket.on("disconnect", () => {
        reconnectToAlternativeMaster(socket);
    });
}

function reconnectToAlternativeMaster(socket) {
    console.log('connecting to another master');
    socket.disconnect();
    setTimeout(() => {
        connectionMaster = socketIO(masterBackup, opts);
        let server = master;
        master = masterBackup;
        masterBackup = server;
        assignMasterEvents(connectionMaster);
    }, 1500);
}

http.listen(port, () => log("Server listening on port: " + port));
