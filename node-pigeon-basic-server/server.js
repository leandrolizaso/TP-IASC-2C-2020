const http = require("http").createServer();
const io = require("socket.io")(http);
const { nanoid } = require("nanoid");
const port = 3000;
const log = console.log;

const chats = new Map();
// {key: 6 character nanoid, value: {messages: [], users: [], isGroup: Boolean}}

const users = new Map();
// {key: username, value: socket id}

function generateID() {
    return nanoid(6);
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

function isPrivateChat(chat, username, otherUsername) {
    return !chat.isGroup && chat.users.includes(username) && chat.users.includes(otherUsername);
}

function getPrivateChat(username, otherUsername) {
    const privateChat = [... chats].find(([_, chat]) => isPrivateChat(chat, username, otherUsername));
    return privateChat ? privateChat[0] : null;
}

function createPrivateChat(users) {
    const id = generateID();
    chats.set(id, {messages: [], users: users, isGroup: false});
    return id;
}

function inviteUserToChat(username, otherUsername, chatID) {
    const socketID = users.get(otherUsername);
    io.to(socketID).emit("chat-invite", {
        username: username, 
        id: chatID
    });
}

function isChatUser(chat, username) {
    return chat.users.includes(username);
}

function getUserChats(username) {
    const userChats = [... chats].filter(([_, chat]) => isChatUser(chat, username))
    return userChats.map(([id, chat]) => {return {
        id: id,
        users: chat.users,
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
    return chat && chat.users.includes(username);
}

function connectedToRoom(id, username) {
    const socket = io.sockets.connected[users.get(username)];
    const rooms = Object.keys(socket.rooms);
    return rooms.includes(id);
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
