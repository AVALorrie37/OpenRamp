const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const pythonCmd = process.env.PYTHON || 'python'
const venvDir = path.join(root, '.venv')
const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false })
  if (r.status !== 0) {
    process.exit(r.status || 1)
  }
}

function ensureVenv() {
  if (!fs.existsSync(venvPython)) {
    run(pythonCmd, ['-m', 'venv', '.venv'])
  }
}

function buildBackendExe() {
  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt', 'pyinstaller'])
  run(venvPython, [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--onefile',
    '--name',
    'openramp-backend',
    '--distpath',
    'backend-dist',
    '--paths',
    '.',
    'src/api/server.py'
  ])
}

function packageDesktop() {
  const npmCmd = isWin ? 'npm.cmd' : 'npm'
  run(npmCmd, ['--prefix', 'frontend', 'run', 'package'])
}

ensureVenv()
buildBackendExe()
packageDesktop()
