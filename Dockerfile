FROM watercycle/node-16.13-chrome-96

WORKDIR /app

COPY . /app
RUN npm install

CMD npm run test