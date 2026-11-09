import { api } from "@/lib/api";

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export async function listNotes() {
  const { data } = await api.get<{ notes: Note[] }>("/notes");
  return data.notes;
}

export async function createNote(input: Pick<Note, "title" | "content">) {
  const { data } = await api.post<{ note: Note }>("/notes", input);
  return data.note;
}

export async function updateNote(id: string, input: Pick<Note, "title" | "content">) {
  const { data } = await api.patch<{ note: Note }>(`/notes/${id}`, input);
  return data.note;
}

export async function deleteNote(id: string) {
  await api.delete(`/notes/${id}`);
}
