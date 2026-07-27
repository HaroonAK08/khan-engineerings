export async function fetchUrduSuggestions(word: string): Promise<string[]> {
  const q = word.trim();
  if (!q || !/[a-zA-Z]/.test(q)) return [];

  const res = await fetch(`/api/transliterate?text=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions?: string[] };
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}
