const http = require('http')
const fs = require('fs')
const path = require('path')

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  const filePath = path.resolve(__dirname, "./index.html")
  fs.createReadStream(filePath).pipe(res)
})

server.listen(process.env.PORT || 3000)