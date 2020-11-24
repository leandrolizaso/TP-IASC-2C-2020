FROM node:12
WORKDIR /usr/src/balancer
COPY package*.json ./
RUN yarn
COPY . .
ENTRYPOINT [ "node",  "balancer.js" ]
CMD []
