import { renderMarkdown } from '../lib/markdown.js';

export default function Markdown({ content, className }) {
  const html = renderMarkdown(content);
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
