import { describe, it, expect } from 'vitest';
import { top20Link } from './top20Link.js';

describe('top20Link', () => {
  it('builds a boys link with gender and event query params', () => {
    expect(top20Link(1, 'Boys', '200 Freestyle')).toBe('/records/top20/1?gender=boys&event=200+Freestyle');
  });

  it('lowercases gender regardless of source casing', () => {
    expect(top20Link(1, 'GIRLS', '200 Freestyle')).toContain('gender=girls');
  });

  it('url-encodes the event name', () => {
    expect(top20Link(10, 'Boys', '200 Medley Relay')).toBe('/records/top20/10?gender=boys&event=200+Medley+Relay');
  });

  it('handles a missing gender/event without throwing', () => {
    expect(top20Link(1, undefined, undefined)).toBe('/records/top20/1?gender=&event=');
  });
});
