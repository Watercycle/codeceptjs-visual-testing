# The purpose of this image is to Dockerize the project for the sake of a
# consistent local dev experience and reproducible CI tests.

FROM watercycle/node-16.13-chrome-96

WORKDIR /app

COPY . /app
RUN npm install

CMD npm run test