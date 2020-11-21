FROM node:12
WORKDIR /usr/src/balancer
COPY package*.json ./
RUN yarn
COPY . .
CMD [ "node", "balancer.js" ]
