FROM node:12
WORKDIR /usr/src/master
COPY package*.json ./
RUN yarn
RUN npm install
COPY . .
ENTRYPOINT [ "node",  "master.js" ]
