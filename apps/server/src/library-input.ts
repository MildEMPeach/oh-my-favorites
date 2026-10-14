import { z } from "zod";

export const httpUrl = z.string().max(8192).refine((value) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Only http(s) URLs are supported");

export const libraryInput = z.object({
  notes: z.string().max(100_000),
  collection: z.string().trim().min(1).max(80).nullable(),
  contentDate: z.iso.date().nullable()
});

export const createLibraryInput = libraryInput.extend({
  notes: libraryInput.shape.notes.default(""), collection: libraryInput.shape.collection.default(null),
  contentDate: libraryInput.shape.contentDate.default(null)
});
