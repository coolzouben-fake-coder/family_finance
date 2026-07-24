const { detectChangedFunctions } = require('../detect-changed-functions')

test('returns unique changed functions and deleted warnings', () => {
  expect(detectChangedFunctions([
    'M\tcloudfunctions/assets/index.js',
    'M\tcloudfunctions/assets/package.json',
    'A\tcloudfunctions/projects/index.js',
    'D\tcloudfunctions/stats/index.js',
    'M\tminiprogram/app.js'
  ])).toEqual({
    changed: ['assets', 'projects'],
    deleted: ['stats']
  })
})

test('only accepts cloud functions registered in cloudbaserc', () => {
  expect(detectChangedFunctions([
    'M\tcloudfunctions/bootstrap/index.js',
    'M\tcloudfunctions/login/index.js',
    'A\tcloudfunctions/admin/index.js',
    'M\tcloudfunctions/__tests__/permissions.test.js',
    'M\tcloudfunctions/unregistered/index.js'
  ])).toEqual({
    changed: ['admin', 'bootstrap', 'login'],
    deleted: []
  })
})
