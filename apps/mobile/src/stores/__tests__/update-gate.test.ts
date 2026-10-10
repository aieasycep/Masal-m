import { useUpdateGate } from '../update-gate';

describe('update gate store (API version gate)', () => {
  beforeEach(() => {
    useUpdateGate.setState({ required: false, minSupportedVersion: null });
  });

  it('starts open', () => {
    expect(useUpdateGate.getState().required).toBe(false);
    expect(useUpdateGate.getState().minSupportedVersion).toBeNull();
  });

  it('require() flips the gate and records the minimum version', () => {
    useUpdateGate.getState().require('2.0.0');
    expect(useUpdateGate.getState().required).toBe(true);
    expect(useUpdateGate.getState().minSupportedVersion).toBe('2.0.0');
  });

  it('a later notification without a version keeps the known minimum', () => {
    useUpdateGate.getState().require('2.0.0');
    useUpdateGate.getState().require(null);
    expect(useUpdateGate.getState().required).toBe(true);
    expect(useUpdateGate.getState().minSupportedVersion).toBe('2.0.0');
  });
});
