import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const adminDir = resolve(__dirname, '..')
const backendDir = resolve(adminDir, '..', 'hanjing-clinic-backend')

const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'

function startProcess(name, cwd, args) {
  const child = spawn(npm, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env }
  })

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[dev:all] ${name} exited`, signal || code)
    shutdown(code || 1)
  })

  return child
}

function isPortOpen(port) {
  return new Promise(resolvePort => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolvePort(true)
    })
    socket.once('error', () => resolvePort(false))
  })
}

let shuttingDown = false
const children = []

if (await isPortOpen(5005)) {
  console.log('[dev:all] backend already running on port 5005, skip starting it.')
} else {
  children.push(startProcess('backend', backendDir, ['run', 'dev']))
}

if (await isPortOpen(3000)) {
  console.log('[dev:all] admin already running on port 3000, skip starting it.')
} else {
  children.push(startProcess('admin', adminDir, ['run', 'dev']))
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
