// Unit tests for the online-music module. No network: every call goes through
// an injected fetch, and the payloads below are trimmed copies of real
// Openverse responses.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_BYTES,
  OnlineError,
  buildSearchUrl,
  fetchAudio,
  normalize,
  search,
  songTitle,
} from "../onlinemusic.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const row = (over = {}) => ({
  id: "abc",
  title: "Lofi Jazz Organ Loop 95 BPM.wav",
  url: "https://cdn.example.org/previews/629/629154-hq.mp3",
  creator: "holizna",
  license: "cc0",
  license_version: "1.0",
  license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
  foreign_landing_url: "https://freesound.org/people/holizna/sounds/629154",
  provider: "freesound",
  filesize: 914893,
  filetype: "mp3",
  duration: 40421,
  attribution: '"Lofi Jazz Organ Loop 95 BPM.wav" by holizna is marked with CC0 1.0.',
  ...over,
});

describe("buildSearchUrl", () => {
  it("asks only for reusable licences and clamps the page size", () => {
    const url = new URL(buildSearchUrl("  dance  ", { limit: 999 }));
    assert.equal(url.origin + url.pathname, "https://api.openverse.org/v1/audio/");
    assert.equal(url.searchParams.get("q"), "dance");
    assert.equal(url.searchParams.get("page_size"), "50");
    assert.equal(url.searchParams.get("license_type"), "commercial,modification");
  });

  it("never asks for zero results", () => {
    assert.equal(new URL(buildSearchUrl("a", { limit: 0 })).searchParams.get("page_size"), "1");
  });
});

describe("normalize", () => {
  it("converts an Openverse payload into the UI shape", () => {
    const [item] = normalize({ results: [row()] });
    assert.equal(item.title, "Lofi Jazz Organ Loop 95 BPM.wav");
    assert.equal(item.creator, "holizna");
    assert.equal(item.license, "CC0 1.0");
    assert.equal(item.provider, "freesound");
    assert.equal(item.seconds, 40);
    assert.equal(item.bytes, 914893);
    assert.equal(item.ext, ".mp3");
    assert.match(item.attribution, /CC0 1\.0/);
    assert.equal(item.audioUrl, "https://cdn.example.org/previews/629/629154-hq.mp3");
  });

  it("drops plain-http urls, unknown formats and junk rows", () => {
    const out = normalize({
      results: [
        row({ id: "http", url: "http://cdn.example.org/a.mp3" }),
        row({ id: "ogg? no", filetype: "xyz", url: "https://cdn.example.org/a.xyz" }),
        row({ id: "no url", url: "" }),
        null,
        row({ id: "ok" }),
      ],
    });
    assert.deepEqual(out.map((i) => i.id), ["ok"]);
  });

  it("trusts the file extension when the API omits filetype", () => {
    const [item] = normalize({ results: [row({ filetype: null, url: "https://cdn.example.org/x.FLAC" })] });
    assert.equal(item.ext, ".flac");
  });

  it("puts full-length tracks before loops and keeps API order inside a bucket", () => {
    const out = normalize({
      results: [
        row({ id: "loop", duration: 12000 }),
        row({ id: "song-b", duration: 180000 }),
        row({ id: "song-a", duration: 200000 }),
        row({ id: "long", duration: 900000 }),
      ],
    });
    assert.deepEqual(out.map((i) => i.id), ["song-b", "song-a", "long", "loop"]);
  });

  it("survives a payload without results", () => {
    assert.deepEqual(normalize({}), []);
    assert.deepEqual(normalize(null), []);
  });
});

describe("search", () => {
  it("returns nothing for a one-character query without hitting the network", async () => {
    let called = false;
    const out = await search("a", { fetchImpl: async () => { called = true; } });
    assert.deepEqual(out, []);
    assert.equal(called, false);
  });

  it("normalises a 200 response", async () => {
    const out = await search("lofi", { fetchImpl: async () => json({ results: [row()] }) });
    assert.equal(out.length, 1);
    assert.equal(out[0].creator, "holizna");
  });

  it("maps 429 to the rate-limit code", async () => {
    await assert.rejects(
      search("lofi", { fetchImpl: async () => new Response("", { status: 429 }) }),
      (err) => err instanceof OnlineError && err.code === "rate",
    );
  });

  it("maps a network failure to the network code", async () => {
    await assert.rejects(
      search("lofi", { fetchImpl: async () => { throw new Error("ENOTFOUND"); } }),
      (err) => err.code === "network",
    );
  });

  it("maps a bad status to the search code", async () => {
    await assert.rejects(
      search("lofi", { fetchImpl: async () => new Response("boom", { status: 500 }) }),
      (err) => err.code === "search",
    );
  });
});

describe("fetchAudio", () => {
  const item = { audioUrl: "https://cdn.example.org/a.mp3", ext: ".mp3", bytes: 3 };

  it("returns the bytes of an audio response", async () => {
    const res = await fetchAudio(item, {
      fetchImpl: async () => new Response(Buffer.from("abc"), { headers: { "content-type": "audio/mpeg" } }),
    });
    assert.equal(res.bytes.toString(), "abc");
    assert.equal(res.ext, ".mp3");
  });

  it("rejects a non-audio response", async () => {
    await assert.rejects(
      fetchAudio(item, {
        fetchImpl: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
      }),
      (err) => err.code === "not-audio",
    );
  });

  it("rejects plain http before touching the network", async () => {
    await assert.rejects(
      fetchAudio({ audioUrl: "http://cdn.example.org/a.mp3" }, { fetchImpl: async () => { throw new Error("no"); } }),
      (err) => err.code === "bad-url",
    );
  });

  it("refuses a file whose declared size is over the cap", async () => {
    await assert.rejects(
      fetchAudio(item, {
        fetchImpl: async () => new Response(Buffer.from("abc"), {
          headers: { "content-type": "audio/mpeg", "content-length": String(MAX_BYTES + 1) },
        }),
      }),
      (err) => err.code === "too-large",
    );
  });

  it("stops reading a chunked body once the cap is hit", async () => {
    await assert.rejects(
      fetchAudio(item, {
        fetchImpl: async () => new Response(Buffer.alloc(64), { headers: { "content-type": "audio/mpeg" } }),
        maxBytes: 16,
      }),
      (err) => err.code === "too-large",
    );
  });

  it("refuses an empty body", async () => {
    await assert.rejects(
      fetchAudio(item, {
        fetchImpl: async () => new Response(Buffer.alloc(0), { headers: { "content-type": "audio/mpeg" } }),
      }),
      (err) => err.code === "empty",
    );
  });

  it("reports a 404 as a download error", async () => {
    await assert.rejects(
      fetchAudio(item, { fetchImpl: async () => new Response("", { status: 404 }) }),
      (err) => err.code === "download",
    );
  });
});

describe("songTitle", () => {
  it("appends the creator and trims runaway titles", () => {
    assert.equal(songTitle({ title: "Night Drive", creator: "Kai" }), "Night Drive — Kai");
    assert.equal(songTitle({ title: "Night Drive" }), "Night Drive");
    assert.equal(songTitle({ title: "x".repeat(300), creator: "y".repeat(300) }).length, 140);
    assert.equal(songTitle({}), "Untitled");
  });
});
