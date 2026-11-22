const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const axios = require("axios");
const { QueryClient } = require("@tanstack/react-query");

// Load the actual TS modules with the frontend's path alias, no browser or DB.
const root = path.resolve(__dirname, "../src");
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const filename = path.join(root, `${file}.ts`);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const requireModule = mod.require.bind(mod);
  mod.require = (id) => id.startsWith("@/") ? load(id.slice(2)) : id.startsWith("./")
    ? load(path.posix.join(path.posix.dirname(file), id)) : requireModule(id);
  modules.set(file, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const { installReadCache } = load("lib/query/read-cache");
const { emitDataChanged } = load("lib/data-changed");

function setup(t, produce = async (n) => n) {
  let calls = 0;
  const client = new QueryClient();
  const api = axios.create({ baseURL: "/api", adapter: async (config) => ({
    data: await produce(++calls), status: 200, statusText: "OK", headers: {}, config,
  }) });
  const uninstall = installReadCache(api, client);
  t.after(() => { uninstall(); client.clear(); });
  return { api, count: () => calls };
}

test("deduplicates equivalent requests and separates filters", async (t) => {
  const { api, count } = setup(t);
  const params = { page: 2, limit: 25 };
  const results = await Promise.all([api.get("/production", { params }), api.get("/production", { params })]);
  assert.deepEqual(results.map((r) => r.data), [1, 1]);
  assert.equal((await api.get("/production", { params })).data, 1);
  assert.equal((await api.get("/production", { params: { ...params, page: 3 } })).data, 2);
  assert.equal(count(), 2);
});

test("a write prevents an earlier in-flight read from satisfying later reads", async (t) => {
  let release;
  let started;
  const firstStarted = new Promise((r) => { started = r; });
  const { api } = setup(t, async (n) => {
    if (n === 1) await new Promise((r) => { release = r; started(); });
    return n;
  });
  const old = api.get("/inventory/stock");
  await firstStarted;
  emitDataChanged();
  assert.equal((await api.get("/inventory/stock")).data, 2);
  release();
  assert.equal((await old).data, 1);
  assert.equal((await api.get("/inventory/stock")).data, 2);
});

test("does not cache mutations, repairs, downloads, or requests with a signal", async (t) => {
  const { api, count } = setup(t);
  for (let i = 0; i < 2; i++) {
    await api.post("/builty");
    await api.get("/claims");
    await api.get("/inventory/warehouses");
    await api.get("/reports/export/finance");
    await api.get("/production", { signal: new AbortController().signal });
  }
  assert.equal(count(), 10);
});

test("a failed read is not cached and its config can be retried by Axios", async (t) => {
  const { api, count } = setup(t, async (n) => {
    if (n === 1) throw new Error("transient");
    return n;
  });
  await assert.rejects(api.get("/production"), /transient/);
  assert.equal((await api.get("/production")).data, 2);
  assert.equal(count(), 2);
});
