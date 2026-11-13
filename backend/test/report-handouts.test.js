const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../src");
const servicePath = path.join(root, "modules/reports/reports.service.js");
const exportPath = path.join(root, "modules/reports/export.util.js");
const exportUtil = require(exportPath);
const original = new Map();

function install(relativePath, exports) {
  const filename = path.join(root, relativePath);
  original.set(filename, require.cache[filename]);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object") {
      if (value.$in) return value.$in.includes(row[key]?._id || row[key]);
      const date = new Date(row[key]).getTime();
      return (!value.$lt || date < new Date(value.$lt).getTime()) &&
        (!value.$gte || date >= new Date(value.$gte).getTime()) &&
        (!value.$lte || date <= new Date(value.$lte).getTime());
    }
    return (row[key]?._id || row[key]) === value;
  });
}

function chain(value) {
  const query = {
    populate() { return query; },
    select() { return query; },
    sort(fields) {
      if (Array.isArray(value)) value.sort((a, b) => {
        for (const [field, direction] of Object.entries(fields)) {
          if (a[field] < b[field]) return -direction;
          if (a[field] > b[field]) return direction;
        }
        return 0;
      });
      return query;
    },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return query;
}

function model(data) {
  return {
    find: (filter = {}) => chain(data.filter(row => matches(row, filter))),
    findById: id => chain(data.find(row => row._id === id) || null),
  };
}

const customer = { _id: "party-1", name: "umer auto/M", phone: "03007372688", group: "group-1" };
const supplier = { _id: "supplier-1", name: "Supplier One" };
const group = { _id: "group-1", name: "Group One" };
const item = (name, quantity, unitPrice) => ({
  product: { name, nameUr: "مصنوعات", family: "drum" },
  pricingMode: "fixed", quantity, unitPrice, lineTotal: quantity * unitPrice,
});
const builties = [
  { _id: "builty-1", customer, builtyNo: "8718/14", builtyDate: "2026-11-09", totalAmount: 165000,
    amountPaid: 70000, balance: 95000, items: [item("Tatra SP", 8, 13500), item("Hino AK front", 6, 9500)] },
  { _id: "builty-2", customer, builtyNo: "8741/20", builtyDate: "2026-11-12", totalAmount: 222000,
    amountPaid: 0, balance: 222000, items: [item("SP 210 A", 6, 11500), item("Tatra SP", 4, 13500),
      item("Nissan TK20 regular", 2, 9500), item("Tatra A", 2, 11500), item("SP 210 F", 4, 9500), item("Nissan Front", 2, 9500)] },
];
const noPaymentBuilty = { ...builties[0], _id: "builty-no-payment", amountPaid: 0, balance: 165000 };
const directBuilty = { ...builties[0], _id: "builty-direct" };
const payments = [
  { _id: "payment-1", customer: customer._id, paymentDate: "2026-11-04", amount: 140000, builty: null, reference: "mezan bank" },
  { _id: "payment-2", customer: customer._id, paymentDate: "2026-11-05", amount: 100000, builty: null },
  { _id: "payment-3", customer: customer._id, paymentDate: "2026-11-07", amount: 60000, builty: null },
  { _id: "payment-4", customer: customer._id, paymentDate: "2026-11-12", amount: 70000, builty: null },
];
const customerEntries = [
  { customer: customer._id, type: "invoice", amount: 457608, entryDate: "2026-10-01" },
  { customer: customer._id, type: "adjustment", signedAmount: -47300, entryDate: "2026-11-04", notes: "Claim credit" },
  ...payments.map(payment => ({ customer: customer._id, type: "payment", amount: payment.amount,
    entryDate: payment.paymentDate, payment: payment._id, notes: payment.reference })),
  ...builties.map(builty => ({ customer: customer._id, type: "invoice", amount: builty.totalAmount,
    entryDate: builty.builtyDate, builty: { builtyNo: builty.builtyNo } })),
  { customer: customer._id, type: "invoice", amount: 0, entryDate: "2026-11-13", builty: { builtyNo: "missing-items" } },
];
const purchases = [{ _id: "purchase-1", supplier: supplier._id, purchaseDate: "2026-11-09", invoiceNo: "P-1",
  materialType: "Steel", quantityKg: 10, ratePerKg: 100, freightAmount: 50,
  totalAmount: 1000, amountPaid: 200, balance: 850 }];
const supplierEntries = [
  { supplier: supplier._id, type: "purchase", amount: 5000, entryDate: "2026-10-01" },
  { supplier: supplier._id, type: "purchase", amount: 1050, entryDate: "2026-11-09", purchase: { invoiceNo: "P-1" } },
  { supplier: supplier._id, type: "payment", amount: 200, entryDate: "2026-11-12", notes: "Bank payment" },
];

install("modules/customers/customer.model.js", model([customer]));
install("modules/suppliers/supplier.model.js", model([supplier]));
install("modules/party-groups/party-group.model.js", model([group]));
const builtyModel = model(builties);
builtyModel.findById = id => chain([...builties, noPaymentBuilty, directBuilty].find(row => row._id === id));
install("modules/builty/builty.model.js", builtyModel);
install("modules/purchases/purchase.model.js", model(purchases));
install("modules/customers/customer-ledger.model.js", model(customerEntries));
install("modules/ledger/ledger.model.js", model(supplierEntries));
install("modules/customers/customer-payment.model.js", model([
  ...payments,
  { _id: "direct-payment", customer: "another-party", builty: directBuilty._id, paymentDate: "2026-11-12", amount: 70000, method: "cash" },
]));
for (const [folder, filename] of [["production", "production"], ["products", "product"], ["workers", "worker"], ["salesmen", "salesman"]]) {
  install(`modules/${folder}/${filename}.model.js`, model([]));
}
for (const [folder, filename] of [["builty", "builty"], ["purchases", "purchase"], ["production", "production"],
  ["expenses", "expense"], ["inventory", "inventory"], ["finance", "finance"]]) {
  install(`modules/${folder}/${filename}.service.js`, {});
}
install("modules/customers/customer.service.js", {
  getById: async () => customer, getBalance: async () => 427308,
});
install("modules/suppliers/supplier.service.js", {
  getById: async () => supplier, getBalance: async () => 5850,
});
install("modules/ledger/ledger.service.js", {
  listBySupplier: async (id, { dateFrom, dateTo }) => supplierEntries.filter(row => matches(row, {
    supplier: id,
    ...(dateFrom || dateTo ? { entryDate: {
      ...(dateFrom ? { $gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { $lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
    } } : {}),
  })).reverse(),
});
let captured;
install("modules/reports/export.util.js", {
  ...exportUtil,
  buildPdf: async input => { captured = input; return Buffer.from("pdf"); },
  buildExcel: async input => { captured = input; return Buffer.from("xlsx"); },
  sendPdf: () => {}, sendExcel: () => {},
});
const reports = require(servicePath);
const period = { dateFrom: "2026-11-01", dateTo: "2026-11-30" };
const partyQuery = { audience: "party", id: customer._id, ...period };
const section = (report, id) => report.sections.find(part => part.id === id);
const cells = row => Array.isArray(row) ? row : row.cells;

function assertAligned(report) {
  for (const part of report.sections) {
    assert.equal(part.columnAlign.length, part.columns.length);
    if (part.columnWidths) assert.equal(part.columnWidths.length, part.columns.length);
    for (const row of part.rows) assert.equal(cells(row).length, part.columns.length);
  }
}

for (const language of ["en", "ur"]) {
  test(`party ${language}: the actual Rs 70,000 receipt is shown once, never on invoice rows`, async () => {
    const preview = await reports.getHandoutPreview({ ...partyQuery, language });
    const transactions = section(preview, "transactions");
    const detail = transactions.rows.slice(0, -1);
    const receipts = detail.filter(row => row.bg === "#e8f5e9");
    assert.equal(receipts.length, 4);
    assert.deepEqual(receipts.map(row => row.cells[9]), ["140,000.00", "100,000.00", "60,000.00", "70,000.00"]);
    for (const row of detail.filter(row => row !== detail[0] && !receipts.includes(row))) assert.equal(row.cells[9], "");
    assert.equal(detail.filter(row => row.cells[9] === "70,000.00").length, 1);
    assert.equal(detail.find(row => row.cells[2] === "8718/14").cells[10], "275,308.00");
    assert.equal(detail.find(row => row.cells[2] === "missing-items").cells[9], "");
    assert.deepEqual(transactions.rows.at(-1).cells.slice(-3), ["387,000.00", "370,000.00", "427,308.00"]);
    assert.equal(detail[0].cells[9], "47,300.00", "claim credit remains an adjustment, not a cash receipt");
    assertAligned(preview);
    if (language === "en") {
      assert.equal(transactions.meta["Previous remaining"], "Rs 457,608.00");
      assert.equal(transactions.meta["Received in period"], "Rs 370,000.00");
      assert.equal(transactions.meta["Still to receive"], "Rs 427,308.00");
    } else assert.equal(detail.find(row => row.cells[2] === "8718/14").cells[1], "بلٹی");
  });
}

test("a later allocated receipt does not leak into an earlier reporting period", async () => {
  const preview = await reports.getHandoutPreview({ ...partyQuery, dateFrom: "2026-11-09", dateTo: "2026-11-09" });
  const transactions = section(preview, "transactions");
  assert.equal(builties[0].amountPaid, 70000);
  assert.equal(transactions.meta["Received in period"], "Rs 0.00");
  assert.equal(transactions.meta["Still to receive"], "Rs 275,308.00");
  for (const row of transactions.rows.slice(0, -1)) assert.equal(row.cells[9], "");
  assert.equal(transactions.rows.filter(row => row.bg === "#e8f5e9").length, 0);
});

test("supplier cash is shown only in payment history, not purchase rows or subtotals", async () => {
  const preview = await reports.getHandoutPreview({ audience: "supplier", id: supplier._id, ...period });
  const purchase = section(preview, "purchases");
  assert.equal(purchase.columns.length, 8);
  assert.equal(purchase.columns.at(-1), "Current remaining (Rs.)");
  assert.ok(!purchase.columns.some(column => /paid/i.test(column)));
  assert.equal(cells(purchase.rows[0]).at(-1), "850.00");
  assert.ok(purchase.rows.every(row => !cells(row).includes("200.00")));
  assert.equal(purchase.meta["Paid in period"], "Rs 200.00");
  assert.equal(purchase.meta["Still to pay"], "Rs 5,850.00");
  assert.equal(section(preview, "payments").rows[0].cells[2], "200.00");
  assert.equal(section(preview, "payments").rows[0].bg, "#e8f5e9");
  assertAligned(preview);
  const earlier = await reports.getHandoutPreview({ audience: "supplier", id: supplier._id, dateFrom: "2026-11-09", dateTo: "2026-11-09" });
  assert.equal(section(earlier, "purchases").meta["Paid in period"], "Rs 0.00");
  assert.equal(section(earlier, "payments").rows.length, 0);
});

test("group handout preserves current allocation status separately from period receipts", async () => {
  const preview = await reports.getHandoutPreview({ audience: "group", id: group._id, ...period });
  const details = section(preview, "builties");
  assert.deepEqual(details.columns.slice(-2), ["Allocated (current, Rs.)", "Remaining (current, Rs.)"]);
  assert.equal(details.rows[0][8], "70,000.00");
  assert.equal(details.rows[0][9], "95,000.00");
  assert.equal(details.rows.at(-1).cells[8], "70,000.00");
  assert.equal(section(preview, "parties").rows[0][3], "370,000.00");
  assertAligned(preview);
});

test("single-builty allocation status is not fabricated into direct payment history", async () => {
  const preview = await reports.getHandoutPreview({ audience: "builty", id: builties[0]._id });
  assert.equal(section(preview, "items").meta["Allocated (current)"], "Rs 70,000.00");
  assert.equal(section(preview, "items").meta["Still to receive (current)"], "Rs 95,000.00");
  assert.equal(preview.sections.length, 1, "unlinked party receipts are not direct builty payments");
  const direct = await reports.getHandoutPreview({ audience: "builty", id: directBuilty._id });
  assert.equal(section(direct, "payments").heading, "Direct payments on this builty");
  assert.equal(section(direct, "payments").rows[0][3], "70,000.00");
  const unpaid = await reports.getHandoutPreview({ audience: "builty", id: noPaymentBuilty._id });
  assert.equal(section(unpaid, "items").meta["Allocated (current)"], "Rs 0.00");
  assert.equal(unpaid.sections.length, 1);
});

const fixtureQueries = [
  ["party-en", partyQuery], ["party-ur", { ...partyQuery, language: "ur" }],
  ["supplier", { audience: "supplier", id: supplier._id, ...period }],
  ["group", { audience: "group", id: group._id, ...period }],
  ["builty", { audience: "builty", id: directBuilty._id }],
];
for (const [name, query] of fixtureQueries) {
  test(`${name}: preview, PDF, and Excel use the same corrected rows and layout`, async () => {
    const preview = await reports.getHandoutPreview(query);
    const expected = preview.sections.map(part => ({ heading: part.heading, columns: part.columns,
      rows: part.rows, columnWidths: part.columnWidths, columnAlign: part.columnAlign }));
    for (const format of ["pdf", "xlsx"]) {
      await reports.exportHandout(query, format, {});
      assert.deepEqual(captured.sections, expected);
    }
    assertAligned(preview);
  });
}

test.after(async () => {
  try {
    if (process.env.REPORT_FIXTURE_DIR) {
      fs.mkdirSync(process.env.REPORT_FIXTURE_DIR, { recursive: true });
      for (const [name, query] of fixtureQueries) {
        fs.writeFileSync(path.join(process.env.REPORT_FIXTURE_DIR, `${name}.json`),
          JSON.stringify(await reports.getHandoutPreview(query), null, 2));
      }
    }
  } finally {
    delete require.cache[servicePath];
    for (const [filename, value] of original) {
      if (value) require.cache[filename] = value;
      else delete require.cache[filename];
    }
  }
});
