import { useMessagePartText } from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';

export function MarkdownText() {
  const part = useMessagePartText();
  const text = part.type === 'text' ? part.text : '';

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');
          return isBlock ? (
            <pre className="bg-muted my-2 overflow-x-auto rounded-md p-3 font-mono text-xs">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">{children}</code>
          );
        },
        ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
