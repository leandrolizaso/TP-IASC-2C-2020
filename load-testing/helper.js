module.exports = {
	setMessage: setMessage,
	registerUsername: registerUsername,
	setRandomUserToChat: setRandomUserToChat
};

const MESSAGES = [
	'hola de nuevo',
	'cómo están todos?',
	'me gusta enviar mensajes',
	'qué sala más amable, no te contestan',
	'lorem ipsum',
	'había una vez truz',
	'en casa funcionaba',
	'si nos organizamos aprobamos todos',
	'un mensaje común y corriente'
];

const USERS = [];

function randomString(length) {
  return Math.random().toString(36).substr(2, length);
}

function setMessage(context, events, done) {
	const index = Math.floor(Math.random() * MESSAGES.length);
	context.vars.message = MESSAGES[index];
	return done();
}

function registerUsername(context, _, done) {
	const newUsername = randomString();	
	USERS.push(newUsername);
	context.vars.username = newUsername;
	return done();
}

function setRandomUserToChat(context, _, done) {
	const index = Math.floor(Math.random() * USERS.length);
	context.vars.otherUsername = USERS[index] || "ninguno";
	console.log("chat with "+context.vars.otherUsername);
	return done();
}
