"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePenLine, Loader2, NotebookPen, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/hooks/use-i18n";
import { createNote, deleteNote, listNotes, updateNote, type Note } from "@/lib/notes-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatNoteDate(value: string, isUrdu: boolean) {
  return new Intl.DateTimeFormat(isUrdu ? "ur-PK" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotesPage() {
  const { t, isUrdu } = useI18n();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listNotes()
      .then((loaded) => {
        if (!cancelled) setNotes(loaded);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("notes.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return notes;
    return notes.filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(needle) ||
        note.content.toLocaleLowerCase().includes(needle)
    );
  }, [notes, query]);

  function openNew() {
    setEditing(null);
    setTitle("");
    setContent("");
    setOpen(true);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setTitle(note.title);
    setContent(note.content);
    setOpen(true);
  }

  async function save() {
    if (!title.trim()) {
      toast.error(t("notes.titleRequired"));
      return;
    }
    setSaving(true);
    try {
      const input = { title: title.trim(), content };
      const saved = editing ? await updateNote(editing.id, input) : await createNote(input);
      setNotes((current) =>
        editing ? current.map((note) => (note.id === saved.id ? saved : note)) : [saved, ...current]
      );
      setOpen(false);
      toast.success(editing ? t("notes.updated") : t("notes.created"));
    } catch {
      toast.error(editing ? t("notes.updateFailed") : t("notes.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(note: Note) {
    if (!window.confirm(t("notes.confirmDelete"))) return;
    try {
      await deleteNote(note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      toast.success(t("notes.deleted"));
    } catch {
      toast.error(t("notes.deleteFailed"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("notes.eyebrow")}
          </p>
          <h1 className="text-nameplate mt-1 text-3xl">{t("notes.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("notes.screenDescription")}</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="size-4" />
          {t("notes.new")}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("notes.search")}
          className="ps-9"
        />
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <NotebookPen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {query ? t("notes.noMatches") : t("notes.empty")}
            </p>
            {!query ? (
              <Button variant="outline" onClick={openNew} className="gap-2">
                <Plus className="size-4" />
                {t("notes.new")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredNotes.map((note) => (
            <Card
              key={note.id}
              className="flex min-h-52 cursor-pointer flex-col transition-colors hover:border-primary/50"
              role="button"
              tabIndex={0}
              onClick={() => openEdit(note)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEdit(note);
                }
              }}
            >
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">{note.title}</CardTitle>
                  <p className="mt-1 font-data text-[10px] text-muted-foreground">
                    {formatNoteDate(note.updatedAt, isUrdu)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(note);
                    }}
                    aria-label={t("notes.edit")}
                  >
                    <FilePenLine className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(note);
                    }}
                    aria-label={t("notes.delete")}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {note.content || t("notes.emptyContent")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("notes.editTitle") : t("notes.newTitle")}</DialogTitle>
            <DialogDescription>{t("notes.editorDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("notes.titlePlaceholder")} maxLength={160} autoFocus />
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={t("notes.placeholder")} className="min-h-56 resize-y" maxLength={50000} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t("common.cancel")}</Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("notes.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
