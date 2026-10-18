import path from "node:path";

// Folder for the files the app stores.
export const dataDir = (): string =>
  path.resolve(process.env.DATA_DIR ?? "data");
