FROM node:12
WORKDIR /usr/src/server
COPY package*.json ./
RUN yarn
COPY . .
ENTRYPOINT [ "node",  "server.js" ]
CMD [ "3000" ]
