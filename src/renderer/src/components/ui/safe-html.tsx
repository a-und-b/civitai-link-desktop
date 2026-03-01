import DOMPurify from 'dompurify';
import { useMemo } from 'react';

type SafeHtmlProps = {
  html: string;
  className?: string;
};

// Add target="_blank" and rel="noopener noreferrer" to links for security (run once)
let hooksRegistered = false;
function registerLinkHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
registerLinkHooks();

export function SafeHtml({ html, className }: SafeHtmlProps) {
  const sanitized = useMemo(() => {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel'],
      ALLOWED_TAGS: [
        'p',
        'br',
        'ul',
        'ol',
        'li',
        'a',
        'strong',
        'em',
        'b',
        'i',
        'h1',
        'h2',
        'h3',
        'h4',
        'blockquote',
        'code',
        'pre',
        'img',
      ],
    });
  }, [html]);

  return (
    <div
      className={[
        'text-sm text-primary [&_a]:text-primary [&_a]:underline [&_a]:hover:opacity-80',
        '[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4',
        '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_li]:mb-1',
        '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_h1,&_h2,&_h3,&_h4]:font-semibold [&_h1,&_h2,&_h3,&_h4]:mt-2',
        '[&_strong]:font-semibold',
        '[&_img]:max-w-full [&_img]:rounded',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
