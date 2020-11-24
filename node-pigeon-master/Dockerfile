FROM node:12
WORKDIR /usr/src/master
COPY package*.json ./
RUN yarn
COPY . .
ENTRYPOINT [ "node",  "master.js" ]
