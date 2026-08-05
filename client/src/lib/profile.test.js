import { describe, it, expect } from 'vitest';
import { profileComplete } from './profile.js';

describe('profileComplete', () => {
  it('is false when both fields are missing', () => {
    expect(profileComplete({ email: 'a@example.com' })).toBe(false);
  });

  it('is false when only one field is set', () => {
    expect(profileComplete({ parent_name: 'Jamie Rivera' })).toBe(false);
    expect(profileComplete({ emergency_phone: '555-123-4567' })).toBe(false);
  });

  it('is true when both fields are set', () => {
    expect(profileComplete({ parent_name: 'Jamie Rivera', emergency_phone: '555-123-4567' })).toBe(true);
  });

  it('handles a null/undefined account without throwing', () => {
    expect(profileComplete(null)).toBe(false);
    expect(profileComplete(undefined)).toBe(false);
  });
});
