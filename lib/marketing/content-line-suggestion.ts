import type { ContentLine } from "./types";

const signals: Record<ContentLine, readonly string[]> = {
  ColorMAP: ["ColorMAP", "chào tân", "Unitour", "booth"],
  Sharing: ["kỹ năng", "hướng dẫn", "bài tập", "kiến thức"],
  Meme: ["meme", "ảnh chế", "hài hước"],
  InsideME: ["InsideME", "câu chuyện nhân viên", "hậu trường đội ngũ"],
};

function words(value: string) {
  return " " + value.toLowerCase().normalize("NFD")
    .replace(/\p{Mark}/gu, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

export function suggestContentLine(brief: string) {
  const input = words(brief);
  const matches = (Object.entries(signals) as [ContentLine, readonly string[]][])
    .map(([line, phrases]) => ({ line, phrases: phrases.filter((phrase) => input.includes(words(phrase))) }))
    .filter(({ phrases }) => phrases.length > 0);
  return matches.length === 1 ? matches[0] : null;
}
