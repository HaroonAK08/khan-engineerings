const ACCEPT = [
  "yes",
  "yeah",
  "yep",
  "ok",
  "okay",
  "confirm",
  "confirmed",
  "haan",
  "han",
  "ha",
  "yaa",
  "ya",
  "add",
  "add kro",
  "add karo",
  "add kar do",
  "add kardein",
  "add kar den",
  "save",
  "save kro",
  "save karo",
  "ji",
  "jee",
  "theek hai",
  "theek",
  "sahi",
  "go ahead",
  "do it",
];

const REJECT = [
  "no",
  "nope",
  "cancel",
  "nahi",
  "nahin",
  "na",
  "stop",
  "abort",
  "don't",
  "dont",
  "mat karo",
  "mat kro",
  "cancel kro",
  "cancel karo",
];

function normalizePhrase(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAcceptPhrase(text: string) {
  const n = normalizePhrase(text);
  if (!n) return false;
  if (ACCEPT.includes(n)) return true;
  return ACCEPT.some((p) => n === p || n.endsWith(` ${p}`) || n.startsWith(`${p} `));
}

export function isRejectPhrase(text: string) {
  const n = normalizePhrase(text);
  if (!n) return false;
  if (REJECT.includes(n)) return true;
  return REJECT.some((p) => n === p || n.endsWith(` ${p}`) || n.startsWith(`${p} `));
}
