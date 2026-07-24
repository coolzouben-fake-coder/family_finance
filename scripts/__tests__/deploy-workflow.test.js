const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-preview.yml'), 'utf8')
const packageJson = require(path.join(root, 'package.json'))

test('deploys validated changed functions sequentially with the pinned CloudBase CLI', () => {
  expect(packageJson.scripts['ci:deploy-functions']).toBeUndefined()
  expect(packageJson.devDependencies['@cloudbase/manager-node']).toBeUndefined()
  expect(packageJson.devDependencies['@cloudbase/cli']).toBeUndefined()
  expect(workflow).toContain('npm install --no-save @cloudbase/cli@3.6.4 miniprogram-ci@2.1.31')
  expect(workflow).toContain('CHANGED_FUNCTIONS must be a JSON array')
  expect(workflow).toContain('for function_name in "${changed_functions[@]}"; do')
  expect(workflow).toContain('npx tcb fn deploy "$function_name" --env-id cloudbase-d7gx0ikiwa58549a4 --yes')
  expect(workflow).not.toContain(' fn delete ')
  expect(workflow).not.toContain('--force')
})

test('passes prepared preview metadata unchanged into the uploader and summary', () => {
  expect(workflow).toContain('PREVIEW_VERSION: ${{ steps.preview.outputs.version }}')
  expect(workflow).toContain('PREVIEW_DESC: ${{ steps.preview.outputs.desc }}')
  expect(workflow).toContain("PREVIEW_VERSION: ${{ steps.preview.outputs.version || 'not uploaded' }}")
})
