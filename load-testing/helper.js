module.exports = {
	setMessage: setMessage,
	registerUsername: registerUsername,
	setRandomUserToChat: setRandomUserToChat,
	rememberChat: rememberChat,
	registerUserForGroup: registerUserForGroup,
	prepareUsersToInvite: prepareUsersToInvite
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
const GROUPUSERS = [];

function randomString(length) {
  return Math.random().toString(36).substr(2, length);
}

function setMessage(context, events, done) {
	const index = Math.floor(Math.random() * MESSAGES.length);
	context.vars.message = MESSAGES[index];
	return done();
}

function registerUsername(context, _, done) {
	const newUsername = "user-"+randomString();	
	USERS.push(newUsername);
	context.vars.username = newUsername;
	return done();
}

function setRandomUserToChat(context, _, done) {
	const index = Math.floor(Math.random() * USERS.length);
	context.vars.otherUsername = USERS[index] || "ninguno";
	return done();
}

function rememberChat(context, _, done) {
	context.vars.chatID = context.vars["$"].replace(/\"/g,"");
	return done();
}

function registerUserForGroup(context, _, done) {
	const newUsername = "groupuser-"+randomString();	
	GROUPUSERS.push(newUsername);
	context.vars.username = newUsername;
	return done();
}

function prepareUsersToInvite(context, _, done) {
	context.vars.users = [];
	Array(10).fill().forEach(() => {
		const user = GROUPUSERS.shift();
		if (user)
			context.vars.users.push(user);
	});
	return done();
}
