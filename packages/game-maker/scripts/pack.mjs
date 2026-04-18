import { copyFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf-8'))
const distDir = resolve(root, 'dist')
const outputName = `${manifest.id}@${manifest.version}.zip`
const outputPath = resolve(root, outputName)

if (!existsSync(distDir)) {
  console.error('dist/ not found — run pnpm build first')
  process.exit(1)
}

copyFileSync(resolve(root, 'manifest.json'), resolve(distDir, 'manifest.json'))

// Try zip first (standard), fall back to 7z (available on some Linux distros without zip)
let result = spawnSync('zip', ['-r', outputPath, '.'], { cwd: distDir, stdio: 'inherit' })
if (result.error) {
  // zip not found — fall back to 7z
  result = spawnSync('7z', ['a', outputPath, '.'], { cwd: distDir, stdio: 'inherit' })
}
if (result.status !== 0) {
  console.error('archiving failed — install zip or 7z')
  process.exit(result.status ?? 1)
}

console.log(`Packed: ${outputName}`)
