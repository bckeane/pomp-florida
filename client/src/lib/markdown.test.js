import { describe, it, expect } from 'vitest';
import { renderMarkdownInline, renderMarkdown } from './markdown.js';

describe('renderMarkdownInline', () => {
  it('escapes raw HTML in the source', () => {
    expect(renderMarkdownInline('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('renders bold and italic', () => {
    expect(renderMarkdownInline('**bold** and *italic* and _also italic_')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <em>also italic</em>'
    );
  });

  it('renders an http link with target=_blank', () => {
    expect(renderMarkdownInline('see [the site](https://example.com)')).toBe(
      'see <a href="https://example.com" target="_blank" rel="noreferrer">the site</a>'
    );
  });

  it('renders a mailto link without target=_blank', () => {
    expect(renderMarkdownInline('[email us](mailto:a@b.com)')).toBe(
      '<a href="mailto:a@b.com">email us</a>'
    );
  });

  it('ignores non-http(s)/mailto link targets', () => {
    expect(renderMarkdownInline('[bad](javascript:alert(1))')).toBe(
      '[bad](javascript:alert(1))'
    );
  });
});

describe('renderMarkdown', () => {
  it('wraps blank-line separated text in paragraphs, joining consecutive lines with <br />', () => {
    expect(renderMarkdown('line one\nline two\n\nline three')).toBe(
      '<p>line one<br />line two</p><p>line three</p>'
    );
  });

  it('turns bullet lines into a list', () => {
    expect(renderMarkdown('- first\n- second')).toBe('<ul><li>first</li><li>second</li></ul>');
  });

  it('mixes paragraphs and lists', () => {
    expect(renderMarkdown('intro\n\n- a\n- b\n\noutro')).toBe(
      '<p>intro</p><ul><li>a</li><li>b</li></ul><p>outro</p>'
    );
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });
});
