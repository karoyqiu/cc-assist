import { AuiIf, AttachmentPrimitive, ComposerPrimitive, useAuiState } from '@assistant-ui/react';
import { ArrowUpIcon, Cross2Icon, PlusIcon, ReloadIcon } from '@radix-ui/react-icons';
import { useEffect, useState, type FC } from 'react';
import { useShallow } from 'zustand/shallow';

import { ModelSelector, type ModelOption } from './ModelSelector';

interface ComposerProps {
  modelOptions: ModelOption[];
  selectedModel: string;
  onModelChange: (key: string) => void;
  onCompact: () => Promise<void>;
}

const toolBtnClass =
  'flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-transparent px-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.98]';

export const Composer: FC<ComposerProps> = ({
  modelOptions,
  selectedModel,
  onModelChange,
  onCompact,
}) => {
  const [compacting, setCompacting] = useState(false);

  async function handleCompact() {
    setCompacting(true);
    try {
      await onCompact();
    } finally {
      setCompacting(false);
    }
  }

  return (
    <ComposerPrimitive.Root className="bg-card mx-auto w-full max-w-3xl flex-col rounded-2xl border border-transparent p-0.5 shadow-[0_0_0_0.5px_hsl(var(--border))] transition-shadow duration-200 focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.075),0_0_0_0.5px_hsl(var(--border))] hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.05),0_0_0_0.5px_hsl(var(--border))]">
      <div className="m-3.5 flex flex-col gap-3.5">
        <div className="relative">
          <div className="max-h-96 w-full overflow-y-auto">
            <ComposerPrimitive.Input
              placeholder="How can I help you today?"
              className="text-foreground placeholder:text-muted-foreground block min-h-6 w-full resize-none bg-transparent outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.closest('form') as HTMLFormElement | null)?.requestSubmit();
                }
              }}
            />
          </div>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="flex min-w-0 flex-1 shrink items-center gap-2">
            <ComposerPrimitive.AddAttachment className={toolBtnClass}>
              <PlusIcon width={16} height={16} />
            </ComposerPrimitive.AddAttachment>
            <button
              type="button"
              onClick={handleCompact}
              disabled={compacting}
              className={toolBtnClass}
              aria-label="Compact conversation"
            >
              <ReloadIcon width={16} height={16} className={compacting ? 'animate-spin' : ''} />
            </button>
          </div>
          <ModelSelector options={modelOptions} value={selectedModel} onChange={onModelChange} />
          <ComposerPrimitive.Send className="bg-primary hover:bg-primary/90 flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-50">
            <ArrowUpIcon width={16} height={16} className="text-primary-foreground" />
          </ComposerPrimitive.Send>
        </div>
      </div>
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="overflow-hidden rounded-b-2xl">
          <div className="border-border bg-muted overflow-x-auto rounded-b-2xl border-t p-3.5">
            <div className="flex flex-row gap-3">
              <ComposerPrimitive.Attachments>
                {() => <ComposerAttachment />}
              </ComposerPrimitive.Attachments>
            </div>
          </div>
        </div>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== 'image') return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const imagePart = s.attachment.content?.find((c) => c.type === 'image');
      if (!imagePart || imagePart.type !== 'image') return {};
      return { src: imagePart.image };
    }),
  );
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file) {
      setObjectUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return objectUrl ?? src;
};

const ComposerAttachment: FC = () => {
  const isImage = useAuiState((s) => s.attachment.type === 'image');
  const src = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Root className="group/thumbnail relative">
      <div
        className="border-border overflow-hidden rounded-lg border shadow-sm hover:shadow-md"
        style={{ width: 120, height: 120, minWidth: 120, minHeight: 120 }}
      >
        <div className="bg-card relative" style={{ width: 120, height: 120 }}>
          {isImage && src ? (
            <img className="h-full w-full object-cover" alt="Attachment" src={src} />
          ) : (
            <div className="text-muted-foreground flex h-full w-full items-center justify-center">
              <AttachmentPrimitive.unstable_Thumb className="text-xs" />
            </div>
          )}
        </div>
      </div>
      <AttachmentPrimitive.Remove
        className="border-border bg-card/90 text-muted-foreground hover:bg-card hover:text-foreground absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border opacity-0 backdrop-blur-sm transition-all group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100"
        aria-label="Remove attachment"
      >
        <Cross2Icon width={12} height={12} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};
