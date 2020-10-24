const http = require("http").createServer();
const io = require("socket.io")(http);
const { nanoid } = require("nanoid");
const port = 3000;
const log = console.log;

const chats = new Map();
// {key: 6 character nanoid, value: {messages: [], users: Map{key: username, value: isAdmin}, isGroup: Boolean}}

const users = new Map();
// {key: username, value: socket id}

function generateID() {
    return nanoid(6);
}

function getMapKeys(map) {
    return [... map.keys()];
}

function registerUser(username, id) {
    users.set(username, id);
}

function isUserConnected(username) {
    return users.has(username);
}

function authorizeUser(username, socket) {
    const connected = isUserConnected(username)
    if (connected) {
        log(username + " was already connected");
    } else {
        log(username + " connected");
        registerUser(username, socket.id);
    }
    socket.authorized = !connected;
    socket.emit("authorization", connected);
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
        messages: [],
        users: new Map(),
        isGroup: false
    }
    users.forEach(user => chat.users.set(user));
    chats.set(id, chat);
    return id;
}

function createGroupChat(username) {
    const id = generateID();
    const chat = {
        messages: [],
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

function inviteUserToChat(username, otherUsername, chatID) {
    notifyUser("chat-invite", username, otherUsername, chatID);
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

function isEmpty(array) {
    return array.length === 0;
}

function sendChatMessages(username, chatID) {
    const socketID = users.get(username);
    const chat = chats.get(chatID);
    if (!isEmpty(chat.messages))
        io.to(socketID).emit("messages", chat.messages);
}

function saveMessage(room, envelope) {
    const chat = chats.get(room);
    chat.messages.push(envelope);
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
    if (isUserConnected(otherUsername))
        notifyUser("chat-group-remove", username, otherUsername, chatID);
}

function setPrivilege(adminStatus, otherUsername, username, chatID) {
    const chat = chats.get(chatID);
    chat.users.set(otherUsername, adminStatus);
    if (isUserConnected(otherUsername))
        notifyUser("chat-group-privilege", username, otherUsername, chatID, {admin: adminStatus});
}

io.on("connection", (socket) => {

    const username = socket.handshake.query.username;

    authorizeUser(username, socket);

    socket.on("message", (data) => {
        log(data);
        const envelope = {
            message: data.message,
            username: username
        }
        socket.to(data.room).emit("message", envelope);
        saveMessage(data.room, envelope);
    })

    socket.on("chat-with", (otherUsername) => {
        log(username + " wants to chat with " + otherUsername);
        if (isUserConnected(otherUsername)) {
            let chatID = getPrivateChat(username, otherUsername);
            if (!chatID)
                chatID = createPrivateChat([username, otherUsername]);
            socket.join(chatID);
            socket.emit("chat-with", chatID);
            sendChatMessages(username, chatID);
            if (!connectedToRoom(chatID, otherUsername)) {
                inviteUserToChat(username, otherUsername, chatID);
            }
        } else
            socket.emit("chat-with", null);
    })

    socket.on("create-group", () => {
        log(username + " wants to create a group");
        let chatID = createGroupChat(username);
        socket.join(chatID);
        socket.emit("create-group", chatID);
    })

    socket.on("invite-to-group", (groupInvite) => {
        const chatID = groupInvite.chatID;
        const otherUsername = groupInvite.username;
        log(username + " wants to invite to group " + otherUsername);
        const canInvite = isUserConnected(otherUsername) && isGroupAdmin(chatID, username) && !isChatMember(chatID, otherUsername);
        if (canInvite) 
            inviteUserToGroupChat(username, otherUsername, chatID);
        socket.emit("invite-to-group", canInvite);
    })

    socket.on("remove-from-group", (groupRemove) => {
        const chatID = groupRemove.chatID;
        const otherUsername = groupRemove.username;
        log(username + " wants to remove from group " + otherUsername);
        const canRemove = isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, username);
        if (canRemove) 
            removeUserFromGroupChat(username, otherUsername, chatID);
        socket.emit("remove-from-group", canRemove);
    })

    socket.on("privilege", (permission) => {
        const otherUsername = permission.username;
        const adminStatus = permission.admin ;
        const chatID = permission.chatID;
        log(username + " wants to set privilege to" + otherUsername);
        const canSetPrivilege = isChatMember(chatID, otherUsername) && isGroupAdmin(chatID, username) && isGroupAdmin(chatID, otherUsername) !== adminStatus;
        if (canSetPrivilege) 
            setPrivilege(adminStatus, otherUsername, username, chatID);
        socket.emit("privilege", canSetPrivilege);
    })

    socket.on("join-chat", (id) => { 
        log(username + " wants to join chat " + id);
        const availableChat = canJoinChat(username, id);

        socket.emit("join-chat", {
            available: availableChat,
            id: id
        });

        if (availableChat)  {
            socket.join(id);
            sendChatMessages(username, id);
        }
    })

    socket.on("query-chats", () => { 
        log(username + " wants to know his chats ");
        socket.emit("query-chats", getUserChats(username));
    })

    socket.on("leave-chat", (id) => { 
        log(username + " wants to leave chat " + id);
        socket.leave(id);
    })

    socket.on("disconnect", () => {
        if (socket.authorized) {
            users.delete(username);
            log(username + " disconnected");
        }
    })
})

http.listen(port, () => log("Server listening on port: " + port));
