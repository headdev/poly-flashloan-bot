FROM node:18.12.0

WORKDIR /app
RUN mkdir -p log && chmod 777 log

ENV NODE_ENV production

COPY package.json .
RUN yarn set version berry

COPY .yarn tsconfig.json .yarnrc.yml ./
RUN yarn install
COPY . ./
RUN yarn build

CMD [ "node", "dist/simulator.js" ]
USER node
ENV YARN_IGNORE_NODE=1
