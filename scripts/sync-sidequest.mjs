import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve(process.argv[2] || '../sidequest')
const destination = resolve('public/experiments/sidequest')
const files = ['index.html', 'style.css', 'playthings.css', 'main.js', 'ball.js', 'pathfinding.js', 'polygons.js', 'scene-geometry.js', 'interaction.js', 'radio.js', 'fonts/FixelVariable.woff2', 'fonts/OFL.txt', 'audio/field-radio.mp3', 'audio/LICENSE.txt']
for (const file of files) {
  await mkdir(resolve(destination, file, '..'), { recursive: true })
  await copyFile(resolve(source, file), resolve(destination, file))
}
console.log(`Synced ${files.length} standalone SIDEQUEST assets`)
