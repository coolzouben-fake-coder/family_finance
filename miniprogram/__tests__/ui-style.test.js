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
});
