import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { build } from "./helpers/build";

const snapshotPath = path.join(__dirname, "routes.snapshot.txt");

test("route table matches committed snapshot", async () => {
  const app = await build();
  const routes = app.printRoutes({ commonPrefix: false });
  await app.close();

  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, routes);
  }

  const expected = readFileSync(snapshotPath, "utf8");
  assert.equal(routes, expected);
});
