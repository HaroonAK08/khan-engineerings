const test = require("node:test");
const assert = require("node:assert/strict");
const { requestCache, memo, invalidate } = require("../src/utils/request-cache");

function inRequest(method, fn) {
  return new Promise((resolve, reject) => {
    requestCache({ method }, {}, () => {
      Promise.resolve().then(fn).then(resolve, reject);
    });
  });
}

test("memo runs the loader once per GET request", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { value: 42 };
  };
  await inRequest("GET", async () => {
    const a = await memo("k", load);
    const b = await memo("k", load);
    assert.equal(calls, 1);
    assert.equal(a.value, 42);
    assert.equal(b.value, 42);
    assert.equal(a, b, "cached callers share one object");
  });
});

test("each request gets its own cache", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };
  await inRequest("GET", () => memo("k", load));
  await inRequest("GET", () => memo("k", load));
  assert.equal(calls, 2);
});

test("writes run with no cache at all", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    calls = 0;
    await inRequest(method, async () => {
      await memo("k", load);
      await memo("k", load);
    });
    assert.equal(calls, 2, `${method} must not share cached reads`);
  }
});

test("memo outside a request calls through every time", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };
  await memo("k", load);
  await memo("k", load);
  assert.equal(calls, 2);
});

test("a rejection is not cached", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return "ok";
  };
  await inRequest("GET", async () => {
    await assert.rejects(memo("k", load), /transient/);
    assert.equal(await memo("k", load), "ok");
    assert.equal(calls, 2);
  });
});

test("concurrent callers share a single in-flight load", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return calls;
  };
  await inRequest("GET", async () => {
    const [a, b, c] = await Promise.all([
      memo("k", load),
      memo("k", load),
      memo("k", load),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual([a, b, c], [1, 1, 1]);
  });
});

test("invalidate clears entries by prefix", async () => {
  let calls = 0;
  const load = async () => {
    calls += 1;
    return calls;
  };
  await inRequest("GET", async () => {
    await memo("settings:waste", load);
    await memo("other:thing", load);
    invalidate("settings:");
    await memo("settings:waste", load);
    await memo("other:thing", load);
    assert.equal(calls, 3, "only the settings: entry should be reloaded");
  });
});
