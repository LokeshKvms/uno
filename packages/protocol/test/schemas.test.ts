import { describe, expect, it } from "vitest";
import { chatSchema, profileSchema } from "../src/index.ts";

const name = (value: string) => profileSchema.safeParse({ name: value });
const chat = (text: string) => chatSchema.safeParse({ text });

describe("profile names", () => {
  it("accepts names in scripts that use combining marks", () => {
    for (const value of ["लोकेश", "தமிழ்", "Zoë", "José", "O'Neil", "Sam 2"]) expect(name(value).success, value).toBe(true);
  });

  it("rejects stacked marks, leading marks and invisible characters", () => {
    for (const value of ["á́́́", "́abc", "ab‮cd", "a​b", "<b>"]) expect(name(value).success, value).toBe(false);
  });
});

describe("chat text", () => {
  it("strips direction overrides and zero-width spaces", () => {
    const parsed = chat("hi ‮gnirts‬ there​");
    expect(parsed.success && parsed.data.text).toBe("hi gnirts there");
  });

  it("keeps joiners used by emoji and Indic scripts", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const parsed = chat(`${family} क्‍ष`);
    expect(parsed.success && parsed.data.text).toBe(`${family} क्‍ष`);
  });

  it("collapses long runs of combining marks", () => {
    const parsed = chat(`z${"́".repeat(40)}`);
    expect(parsed.success && parsed.data.text).toBe(`z${"́".repeat(3)}`);
  });

  it("rejects messages that are empty after cleaning", () => {
    expect(chat("​‮ ").success).toBe(false);
  });
});
