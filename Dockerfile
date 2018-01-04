FROM node:latest

WORKDIR /opt
COPY . /opt

RUN npm install

CMD ["node", "dropper.js"]
