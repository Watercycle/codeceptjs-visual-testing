exports.config = {
  tests: 'tests/*.test.js',
  output: '../output',
  helpers: {
    Puppeteer: {
      url: 'http://web:80',
      host: process.env.HOST,
      show: false,
      windowSize: '1200x900',
      waitForNavigation: "networkidle0",
      chrome: {
        args: ["--no-sandbox"]
      }
    }
  },
  include: {
    I: './steps_file.js'
  },
  bootstrap: null,
  mocha: {},
  name: 'tests',
  plugins: {
    pauseOnFail: {},
    retryFailedStep: {
      enabled: true
    },
    tryTo: {
      enabled: true
    },
    screenshotOnFail: {
      enabled: true
    }
  }
}