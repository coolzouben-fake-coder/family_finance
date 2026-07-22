function isAllowedUser(user) {
  return Boolean(user && user.enabled === true);
}

describe('permission helper behavior', () => {
  test('allows enabled whitelist user', () => {
    expect(isAllowedUser({ openid: 'o1', enabled: true })).toBe(true);
  });

  test('denies missing or disabled user', () => {
    expect(isAllowedUser(null)).toBe(false);
    expect(isAllowedUser({ openid: 'o1', enabled: false })).toBe(false);
  });
});
