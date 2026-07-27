const fs = require('fs');
const path = require('path');

describe('WeUI visual system', () => {
  test('imports WeUI rpx styles before local supplements', () => {
    const appStyles = fs.readFileSync(path.join(__dirname, '../app.wxss'), 'utf8');

    expect(appStyles).toContain('@import "./styles/weui.wxss";');
    expect(appStyles.indexOf('./styles/weui.wxss')).toBeLessThan(appStyles.indexOf('./styles/design-tokens.wxss'));
  });

  test('documents WeUI as the project UI standard', () => {
    const guide = fs.readFileSync(path.join(__dirname, '../../docs/ui/weui-style-guide.md'), 'utf8');
    const legacyGuide = fs.readFileSync(path.join(__dirname, '../../docs/ui/apple-style-guide.md'), 'utf8');

    expect(guide).toContain('# WeUI Style Guide');
    expect(guide).toContain('WeUI');
    expect(guide).toContain('weui-cells');
    expect(guide).toContain('weui-btn');
    expect(guide).not.toContain('Apple-Inspired');
    expect(legacyGuide).toContain('Deprecated UI Guide');
    expect(legacyGuide).toContain('docs/ui/weui-style-guide.md');
  });

  test('keeps admin editor action buttons inside their grid cells', () => {
    const adminStyles = fs.readFileSync(path.join(__dirname, '../pages/admin/admin.wxss'), 'utf8');
    const actionRule = adminStyles.match(/\.editor-actions \.weui-btn\s*\{([^}]+)\}/);

    expect(adminStyles).toContain('.editor-actions { display: grid;');
    expect(actionRule && actionRule[1]).toEqual(expect.stringContaining('min-width: 0;'));
    expect(actionRule && actionRule[1]).toEqual(expect.stringContaining('max-width: none;'));
    expect(actionRule && actionRule[1]).toEqual(expect.stringContaining('box-sizing: border-box;'));
  });

  test('keeps project detail buttons from inheriting overflowing WeUI widths', () => {
    const projectFormStyles = fs.readFileSync(path.join(__dirname, '../pages/project-form/project-form.wxss'), 'utf8');
    const modeButtonRule = projectFormStyles.match(/\.return-mode-button\s*\{([^}]+)\}/);
    const actionButtonRule = projectFormStyles.match(/\.primary-button,\s*\.secondary-button,\s*\.danger-button\s*\{([^}]+)\}/);

    expect(modeButtonRule && modeButtonRule[1]).toEqual(expect.stringContaining('min-width: 0;'));
    expect(modeButtonRule && modeButtonRule[1]).toEqual(expect.stringContaining('max-width: none;'));
    expect(actionButtonRule && actionButtonRule[1]).toEqual(expect.stringContaining('width: 100%;'));
    expect(actionButtonRule && actionButtonRule[1]).toEqual(expect.stringContaining('min-width: 0;'));
    expect(actionButtonRule && actionButtonRule[1]).toEqual(expect.stringContaining('max-width: none;'));
    expect(actionButtonRule && actionButtonRule[1]).toEqual(expect.stringContaining('box-sizing: border-box;'));
  });
});
