import { describe, it, expect } from 'vitest';
import { displayField } from './accountDisplay.js';

describe('displayField', () => {
  it('renders null/undefined/empty string as an em dash', () => {
    expect(displayField(null)).toBe('—');
    expect(displayField(undefined)).toBe('—');
    expect(displayField('')).toBe('—');
  });

  it('passes through a real value unchanged', () => {
    expect(displayField('Jane Doe')).toBe('Jane Doe');
    expect(displayField('555-0100')).toBe('555-0100');
  });
});
