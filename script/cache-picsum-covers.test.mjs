import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cachePicsumCovers } from "./cache-picsum-covers.mjs";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const cover = (id) => "https://picsum.photos/seed/" + id + "/1200/630";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "picsum-cache-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const site = path.join(root, "dist");
  await fs.mkdir(path.join(site, "blog"), { recursive: true });
  return { site, cache: path.join(root, "cache"), base: "/cmchen-blog/" };
}
const response = (body = jpeg) => ({ ok: true, headers: new Headers(), arrayBuffer: async () => body });

test("deduplicates original seed photos and reuses warm cache", async (t) => {
  const options = await fixture(t);
  const html = [cover("%E7%94%B5%E8%B7%AF"), cover("second")].map((url) => '<img src="' + url + '">').join("");
  const index = path.join(options.site, "index.html");
  const article = path.join(options.site, "blog", "index.html");
  await Promise.all([fs.writeFile(index, html), fs.writeFile(article, html)]);
  const requested = [];
  const result = await cachePicsumCovers({ ...options, fetchImage: async (url) => { requested.push(url); return response(); } });
  assert.deepEqual(result, { covers: 2, reused: 0, downloaded: 2, failed: 0, unresolved: 0 });
  assert.equal(new Set(requested).size, 2);
  const first = await fs.readFile(index, "utf8");
  assert.equal(first, await fs.readFile(article, "utf8"));
  assert.equal((first.match(/src="\/cmchen-blog\/_covers\/[a-f0-9]{24}\.jpg"/g) || []).length, 2);
  for (const name of await fs.readdir(path.join(options.site, "_covers"))) {
    assert.deepEqual(await fs.readFile(path.join(options.site, "_covers", name)), jpeg);
  }
  await Promise.all([fs.writeFile(index, html), fs.writeFile(article, html)]);
  const warm = await cachePicsumCovers({ ...options, fetchImage: () => assert.fail("warm cache must not fetch") });
  assert.deepEqual(warm, { covers: 2, reused: 2, downloaded: 0, failed: 0, unresolved: 0 });
});

test("an unavailable source causes one probe, retaining all original URLs", async (t) => {
  const options = await fixture(t);
  const html = Array.from({ length: 105 }, (_, i) => '<img src="' + cover(i) + '">').join("");
  const file = path.join(options.site, "index.html");
  await fs.writeFile(file, html);
  let requests = 0;
  const result = await cachePicsumCovers({ ...options, fetchImage: async () => { requests++; throw new Error("unreachable"); } });
  assert.equal(requests, 1);
  assert.equal(result.unresolved, 105);
  assert.equal(await fs.readFile(file, "utf8"), html);
});

test("rejects HTML responses and leaves unrelated image sources untouched", async (t) => {
  const options = await fixture(t);
  const html = '<img src="' + cover("first") + '"><img src="https://example.com/image.jpg">';
  const file = path.join(options.site, "index.html");
  await fs.writeFile(file, html);
  const result = await cachePicsumCovers({ ...options, fetchImage: async () => response(Buffer.from("<html>error</html>")) });
  assert.equal(result.failed, 1);
  assert.equal(result.covers, 1);
  assert.equal(await fs.readFile(file, "utf8"), html);
  assert.deepEqual(await fs.readdir(path.join(options.site, "_covers")), []);
});

test("social preview images retain absolute URLs", async (t) => {
  const options = await fixture(t);
  const html = '<meta property="og:url" content="https://example.org/cmchen-blog/blog/test/"><meta property="og:image" content="' + cover("first") + '"><img src="' + cover("first") + '">';
  const file = path.join(options.site, "index.html");
  await fs.writeFile(file, html);
  await cachePicsumCovers({ ...options, fetchImage: async () => response() });
  const result = await fs.readFile(file, "utf8");
  assert.match(result, /property="og:image" content="https:\/\/example\.org\/cmchen-blog\/_covers\/[a-f0-9]{24}\.jpg"/);
  assert.match(result, /<img src="\/cmchen-blog\/_covers\/[a-f0-9]{24}\.jpg"/);
});
