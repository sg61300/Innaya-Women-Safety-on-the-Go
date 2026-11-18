import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
export function normaliseWord(w: string): string {
  // \p{M} keeps combining marks (Devanagari/Kannada vowel signs, virama) — stripping them mangles Hindi/Kannada words
  return w.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}
export function hashWord(word: string, salt: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}:${normaliseWord(word)}`)));
}
// Hash a secret EXACTLY as typed — no normalisation. Used for the app-password
// hash, where case and punctuation must matter (unlike safety words). Never
// substitute hashWord here: it lowercases and strips punctuation, which would let
// any case/punctuation variant of the password through (weaker than a sign-in).
export function hashSecret(secret: string, salt: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}:${secret}`)));
}
