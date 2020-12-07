FROM node:12
WORKDIR /usr/src/balancer
COPY package*.json ./
RUN yarn
RUN npm install
COPY . .
ENTRYPOINT [ "node",  "balancer.js" ]
CMD []
