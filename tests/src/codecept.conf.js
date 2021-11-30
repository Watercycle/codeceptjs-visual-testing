exports.config = {
  tests: 'tests/*.test.js',
  output: '../output',
  helpers: {
    Puppeteer: {
      url: 'http://web:3000',
      host: process.env.HOST,
      show: false,
      windowSize: '1200x900',
      waitForNavigation: "networkidle0",
      chrome: {
        args: ["--no-sandbox"]
      }
    },
    VisualTesting: {
      require: '../../index.js',
      baseFolder: '../visual/',
      diffFolder: '../output/visual/',
    },
  },
  include: {
    I: './steps_file.js'
  },
  bootstrap: null,
  mocha: {},
  name: 'tests',
  plugins: {
    pauseOnFail: {},
    tryTo: {
      enabled: true
    }
  }
}