import { compareSemver } from './app-version.middleware';

describe('compareSemver', () => {
  it('orders versions correctly', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.9.9', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
  });

  it('tolerates missing parts', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1', '1.0.1')).toBe(-1);
  });
});
