import { type FC, useState } from 'react';

interface UserQuestionCardProps {
  sessionId: string;
  question: string;
  choices: string[];
  onAnswer: (sessionId: string, answer: string) => void;
}

export const UserQuestionCard: FC<UserQuestionCardProps> = ({
  sessionId,
  question,
  choices,
  onAnswer,
}) => {
  const [selected, setSelected] = useState<string | null>(null);

  function handleChoice(choice: string) {
    if (selected) return;
    setSelected(choice);
    onAnswer(sessionId, choice);
  }

  return (
    <div className="border-border bg-card mx-auto my-2 w-full max-w-3xl rounded-xl border p-4">
      <div className="text-foreground mb-3 flex items-center gap-2 text-sm font-medium">
        <span>❓</span>
        <span>Claude asks:</span>
      </div>
      <p className="text-foreground mb-4 text-sm">{question}</p>
      <div className="flex flex-col gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={selected !== null}
            onClick={() => handleChoice(choice)}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
              selected === choice
                ? 'border-border bg-muted text-foreground'
                : selected !== null
                  ? 'border-border/50 text-muted-foreground opacity-50'
                  : 'border-border text-foreground hover:bg-muted bg-transparent'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
};
