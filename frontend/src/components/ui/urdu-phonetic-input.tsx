"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fetchUrduSuggestions } from "@/lib/transliterate";
import { useI18n } from "@/hooks/use-i18n";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

const LATIN_WORD = /[a-zA-Z][a-zA-Z']*$/;

function splitTail(text: string): { head: string; word: string } {
  const match = text.match(LATIN_WORD);
  if (!match || match.index == null) return { head: text, word: "" };
  return { head: text.slice(0, match.index), word: match[0] };
}

export function UrduPhoneticInput({
  value,
  onChange,
  className,
  onKeyDown,
  onBlur,
  dir,
  ...props
}: Props) {
  const { isUrdu } = useI18n();
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = isUrdu;
  const { word } = splitTail(value);

  React.useEffect(() => {
    if (!enabled || !word) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchUrduSuggestions(word).then((list) => {
        setSuggestions(list);
        setActive(0);
        setOpen(list.length > 0);
      });
    }, 180);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [word, enabled]);

  function applySuggestion(choice: string) {
    const { head } = splitTail(value);
    onChange(`${head}${choice}`);
    setSuggestions([]);
    setOpen(false);
  }

  function commitFirst() {
    if (!enabled || !word || suggestions.length === 0) return false;
    applySuggestion(suggestions[active] ?? suggestions[0]);
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (enabled && open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (commitFirst()) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === " ") {
        if (word && suggestions.length > 0) {
          e.preventDefault();
          const { head } = splitTail(value);
          onChange(`${head}${suggestions[active] ?? suggestions[0]} `);
          setSuggestions([]);
          setOpen(false);
          return;
        }
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative w-full">
      <Input
        {...props}
        dir={dir ?? (enabled ? "rtl" : undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          setTimeout(() => setOpen(false), 120);
          onBlur?.(e);
        }}
        className={cn(enabled && "font-[family-name:var(--font-urdu)]", className)}
        autoComplete="off"
        spellCheck={false}
      />
      {enabled && open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          dir="rtl"
        >
          {suggestions.map((s, i) => (
            <li key={`${s}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-right text-sm font-[family-name:var(--font-urdu)]",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
