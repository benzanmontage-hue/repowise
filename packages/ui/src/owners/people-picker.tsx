"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "../ui/input";
import { OwnerAvatar } from "./owner-avatar";
import type { KnowledgePerson } from "./knowledge-files";

export interface PeoplePickerProps {
  people: readonly KnowledgePerson[];
  selected: readonly string[];
  onChange: (keys: string[]) => void;
  /** Accessible name and placeholder. */
  label?: string;
  placeholder?: string;
}

/** Matches listed before the reader narrows the search. */
const MAX_OPTIONS = 8;

/**
 * Searchable multi-select of people, with avatars. A combobox over a plain
 * list: type to filter by name or email, arrows to move, Enter to add,
 * Backspace on an empty field to drop the last pick.
 */
export function PeoplePicker({
  people,
  selected,
  onChange,
  label = "Pick people",
  placeholder = "Search by name or email…",
}: PeoplePickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  const byKey = React.useMemo(() => new Map(people.map((p) => [p.key, p])), [people]);
  const chosen = new Set(selected);
  const needle = query.trim().toLowerCase();
  const options = people
    .filter(
      (p) =>
        !chosen.has(p.key) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.email ?? "").toLowerCase().includes(needle)),
    )
    .slice(0, MAX_OPTIONS);

  const add = (key: string) => {
    onChange([...selected, key]);
    setQuery("");
    setActive(0);
  };
  const remove = (key: string) => onChange(selected.filter((k) => k !== key));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      add(options[active]!.key);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]!);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <ul aria-label="Selected people" className="flex flex-wrap gap-1.5">
          {selected.map((key) => {
            const p = byKey.get(key) ?? { key, name: key, email: null };
            return (
              <li
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] py-0.5 pl-0.5 pr-1 text-xs text-[var(--color-text-primary)]"
              >
                <OwnerAvatar name={p.name} email={p.email} size="sm" />
                {p.name}
                <button
                  type="button"
                  onClick={() => remove(key)}
                  aria-label={`Remove ${p.name}`}
                  className="rounded-full p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-text-tertiary)]" />
        <Input
          role="combobox"
          aria-label={label}
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(open && options[active] ? { "aria-activedescendant": `${listId}-${active}` } : {})}
          value={query}
          placeholder={placeholder}
          className="pl-8"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on an option lands before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {open && options.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-overlay)] py-1 shadow-lg"
          >
            {options.map((p, i) => (
              <li
                key={p.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(p.key)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                  i === active ? "bg-[var(--color-bg-elevated)]" : ""
                }`}
              >
                <OwnerAvatar name={p.name} email={p.email} size="sm" />
                <span className="min-w-0">
                  <span className="block text-[var(--color-text-primary)]">{p.name}</span>
                  {p.email && p.email !== p.name && (
                    <span className="block truncate text-xs text-[var(--color-text-tertiary)]" title={p.email}>
                      {p.email}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
