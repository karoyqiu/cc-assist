import { ActionBarPrimitive, AuiIf, MessagePrimitive } from '@assistant-ui/react';
import {
  ClipboardIcon,
  Pencil1Icon,
  ReloadIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@radix-ui/react-icons';
import { type FC } from 'react';

import { MarkdownText } from '../assistant-ui/markdown-text';

const actionBtnClass =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95';

export const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
      <AuiIf condition={(s) => s.message.role === 'user'}>
        <div className="group/user bg-muted text-foreground relative inline-flex max-w-[75ch] flex-col gap-2 rounded-xl py-2.5 pr-6 pl-2.5 transition-all">
          <div className="relative flex flex-row gap-2">
            <div className="shrink-0 self-start">
              <div className="bg-foreground text-background flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none">
                U
              </div>
            </div>
            <div className="flex-1">
              <div className="relative grid grid-cols-1 gap-2 py-0.5">
                <div className="wrap-break-word whitespace-pre-wrap">
                  <MessagePrimitive.Parts>
                    {({ part }) => {
                      if (part.type === 'text') return <MarkdownText />;
                      return null;
                    }}
                  </MessagePrimitive.Parts>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-2 bottom-0">
            <ActionBarPrimitive.Root
              autohide="not-last"
              className="border-border bg-card/80 pointer-events-auto min-w-max translate-x-1 translate-y-4 rounded-lg border p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition group-hover/user:translate-x-0.5 group-hover/user:opacity-100"
            >
              <div className="text-muted-foreground flex items-center">
                <ActionBarPrimitive.Reload className={actionBtnClass}>
                  <ReloadIcon width={16} height={16} />
                </ActionBarPrimitive.Reload>
                <ActionBarPrimitive.Edit className={actionBtnClass}>
                  <Pencil1Icon width={16} height={16} />
                </ActionBarPrimitive.Edit>
              </div>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.message.role === 'assistant'}>
        <div className="relative mb-12">
          <div className="relative leading-[1.65rem]">
            <div className="grid grid-cols-1 gap-2.5">
              <div className="text-foreground pr-8 pl-2 wrap-break-word whitespace-normal">
                <MessagePrimitive.Parts>
                  {({ part }) => {
                    if (part.type === 'text') return <MarkdownText />;
                    return null;
                  }}
                </MessagePrimitive.Parts>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <ActionBarPrimitive.Root
              hideWhenRunning
              autohide="not-last"
              className="pointer-events-auto flex w-full translate-y-full flex-col items-end px-2 pt-2 transition"
            >
              <div className="text-muted-foreground flex items-center">
                <ActionBarPrimitive.Copy className={actionBtnClass}>
                  <ClipboardIcon width={16} height={16} />
                </ActionBarPrimitive.Copy>
                <ActionBarPrimitive.FeedbackPositive className={actionBtnClass}>
                  <ArrowUpIcon width={14} height={14} />
                </ActionBarPrimitive.FeedbackPositive>
                <ActionBarPrimitive.FeedbackNegative className={actionBtnClass}>
                  <ArrowDownIcon width={14} height={14} />
                </ActionBarPrimitive.FeedbackNegative>
                <ActionBarPrimitive.Reload className={actionBtnClass}>
                  <ReloadIcon width={16} height={16} />
                </ActionBarPrimitive.Reload>
              </div>
              <AuiIf condition={(s) => s.message.isLast}>
                <p className="text-muted-foreground mt-2 w-full text-right text-xs leading-relaxed opacity-90">
                  Claude can make mistakes. Please double-check responses.
                </p>
              </AuiIf>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
};
