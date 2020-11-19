FROM node:12
WORKDIR /usr/src/client
COPY package*.json ./
RUN yarn
COPY . .
CMD [ "node", "client.js" ]
