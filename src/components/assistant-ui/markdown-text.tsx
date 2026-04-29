import { useMessagePartText } from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownText() {
  const part = useMessagePartText();
  const text = part.type === 'text' ? part.text : '';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        h1: ({ children }) => (
          <h1 className="mt-4 mb-3 text-xl font-bold first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-3 mb-2 text-base font-semibold first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="mt-2 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
        ),
        ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-primary underline underline-offset-2 hover:opacity-80"
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border my-4" />,
        pre: ({ children }) => <>{children}</>,
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
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-border border-b">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-border border-b last:border-0">{children}</tr>,
        th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="px-3 py-1.5">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
