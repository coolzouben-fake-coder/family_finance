const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const cloudbaseConfig = require(path.resolve(__dirname, '..', 'cloudbaserc.json'))
const registeredFunctions = new Set(cloudbaseConfig.functions.map(({ name }) => name))

function detectChangedFunctions(lines) {
  const changed = new Set()
  const deleted = new Set()

  for (const line of lines) {
    const [status, ...paths] = line.trim().split('\t')
    for (const file of paths) {
      const match = file.match(/^cloudfunctions\/([^/]+)\//)
      if (!match || !registeredFunctions.has(match[1])) continue

      if (status.startsWith('D')) deleted.add(match[1])
      else changed.add(match[1])
    }
  }

  for (const name of deleted) changed.delete(name)

  return {
    changed: [...changed].sort(),
    deleted: [...deleted].sort()
  }
}

function getArgument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function isZeroSha(sha) {
  return /^0+$/.test(sha || '')
}

function writeOutput(result) {
  if (!process.env.GITHUB_OUTPUT) return
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `changed=${JSON.stringify(result.changed)}\ndeleted=${JSON.stringify(result.deleted)}\n`
  )
}

function main() {
  const before = getArgument('--before')
  const after = getArgument('--after')
  const result = !before || !after || isZeroSha(before)
    ? { changed: [], deleted: [] }
    : detectChangedFunctions(execFileSync('git', ['diff', '--name-status', before, after], { encoding: 'utf8' }).split('\n'))

  writeOutput(result)
}

if (require.main === module) main()

module.exports = { detectChangedFunctions }
