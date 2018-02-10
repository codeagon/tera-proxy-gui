console.log(`Running Electron ${process.versions.electron} (Node.js ${process.versions.node})`)

const proxy = require('./proxy')

proxy.Start('EU')