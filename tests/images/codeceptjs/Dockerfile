FROM node:16.13 AS base

# Available versions: https://www.ubuntuupdates.org/package/google_chrome/stable/main/base/google-chrome-stable
# Keep in mind that certain versions of Puppeteer only work with certain versions of Chrome.
ARG CHROME_VERSION="96.0.4664.45-1"
RUN apt-get update \
  && wget --no-verbose -O /tmp/chrome.deb https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_VERSION}_amd64.deb \
  && apt install -y /tmp/chrome.deb \
  && rm /tmp/chrome.deb \
  && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

WORKDIR /app

COPY ../../../ /app/
RUN npm install

CMD npm run test