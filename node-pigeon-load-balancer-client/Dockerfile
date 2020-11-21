FROM node:12
WORKDIR /usr/src/balancer_backup
COPY package*.json ./
RUN yarn
COPY . .
CMD [ "node", "balancer.js" ]
