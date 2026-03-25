const fs = require('fs')
const path = require('path')

const exePath = path.resolve(__dirname, '../../backend-dist/openramp-backend.exe')
if (!fs.existsSync(exePath)) {
  process.stderr.write(`Missing backend executable: ${exePath}\n`)
  process.exit(1)
}
process.stdout.write(`Backend executable found: ${exePath}\n`)
