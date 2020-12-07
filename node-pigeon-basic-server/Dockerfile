FROM node:12
WORKDIR /usr/src/server
COPY package*.json ./
RUN yarn
RUN npm install
COPY . .
ENTRYPOINT [ "node",  "server.js" ]
CMD [ "3000" ]
