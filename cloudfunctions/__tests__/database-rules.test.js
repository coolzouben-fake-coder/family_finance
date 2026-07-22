const fs = require('fs');
const path = require('path');

describe('cloud database security rules', () => {
  test('denies direct client reads and writes by default', () => {
    const rulesPath = path.join(__dirname, '../../database.rules.json');
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

    expect(rules).toEqual({ read: false, write: false });
  });

  test('documents deployment and direct-access denial checks for every collection', () => {
    const checklist = fs.readFileSync(
      path.join(__dirname, '../../docs/qa/first-version-checklist.md'),
      'utf8'
    );

    ['users', 'family_assets', 'asset_changes', 'categories', 'projects', 'settings']
      .forEach((collection) => expect(checklist).toContain(`\`${collection}\``));
    expect(checklist).toContain('database.rules.json');
    expect(checklist).toContain('客户端直接读取和写入均被拒绝');
  });
});
