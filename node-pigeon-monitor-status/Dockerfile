FROM node:12
WORKDIR /usr/src/monitor
COPY package*.json ./
RUN yarn
RUN npm install
COPY . .
ENTRYPOINT [ "node",  "monitor.js" ]
