import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/finance.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, Date, Intl });
const { parseAmount, validDate, totals, readEntries } = mod.exports;
test("refresh restores the selected month and finds entries outside the current month", () => {
  const { financeMonth } = mod.exports;
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null };
  const entries = [{ date: "2026-08-12" }, { date: "2026-07-14" }];
  assert.equal(financeMonth(storage, "account.finance", entries, "2026-09"), "2026-08");
  values.set("account.finance.month", "2026-07");
  assert.equal(financeMonth(storage, "account.finance", entries, "2026-09"), "2026-07");
  assert.equal(financeMonth(storage, "other.finance", [], "2026-09"), "2026-09");
  values.set("account.finance.month", "bad");
  assert.equal(financeMonth(storage, "account.finance", entries, "2026-09"), "2026-08");
});
test("custom categories persist, reject duplicates and keep a final option", () => {
  const { readCategories, changeCategory } = mod.exports;
  const defaults = readCategories({ getItem: () => null }, "categories");
  const added = changeCategory(defaults, "expense", "  Travel abroad  ", false);
  assert.equal(added.expense.at(-1), "Travel abroad");
  assert.throws(() => changeCategory(added, "expense", "travel abroad", false));
  const saved = readCategories({ getItem: () => JSON.stringify(added) }, "categories");
  assert.equal(saved.expense.at(-1), "Travel abroad");
  assert.equal(changeCategory(saved, "expense", "Travel abroad", true).expense.includes("Travel abroad"), false);
  assert.throws(() => changeCategory({ income: ["Salary"], expense: ["Food"] }, "expense", "Food", true));
  assert.throws(() => readCategories({ getItem: () => "broken" }, "categories"));
});
test("calendar keeps 42 fixed cells with correct weekdays, leap days and six-week months", () => {
  for (const [month, days] of [["2026-02", 28], ["2028-02", 29], ["2026-08", 31], ["2026-12", 31]]) {
    const cells = mod.exports.monthCells(month);
    assert.equal(cells.length, 42);
    assert.equal(cells.filter(Boolean).length, days);
    assert.equal(cells.indexOf(`${month}-01`), new Date(`${month}-01T12:00:00`).getDay());
    assert.equal(cells.filter(Boolean).at(-1), `${month}-${days}`);
  }
  const entries = [{ date: "2026-09-14", type: "income", amount: 12345 }, { date: "2026-09-14", type: "expense", amount: 2000 }, { date: "2026-09-15", type: "income", amount: 999 }];
  const day = totals(entries.filter((entry) => entry.date === "2026-09-14"));
  assert.equal(day.income, 12345); assert.equal(day.expense, 2000);
});
test("money accepts cents precisely and rejects invalid amounts", () => {
  assert.equal(parseAmount("0.10") + parseAmount("0.20"), 30);
  assert.equal(parseAmount("1250.5"), 125050);
  for (const value of ["0", "-1", "1.001", "NaN", "Infinity", "1e3", "", "1000000000"]) assert.equal(parseAmount(value), null);
});
test("dates validate leap years and reject invalid calendar dates without throwing", () => {
  assert.equal(validDate("2028-02-29"), true);
  for (const value of ["2026-02-29", "2026-13-01", "2026-04-31", "", "2026-00-10"]) assert.equal(validDate(value), false);
});
test("totals handle expenses exceeding income and empty months", () => {
  assert.equal(totals([]).balance, 0);
  const result = totals([{ type: "income", amount: 10010 }, { type: "expense", amount: 8000 }, { type: "expense", amount: 3000 }]);
  assert.equal(result.income, 10010); assert.equal(result.expense, 11000); assert.equal(result.balance, -990);
});
test("stored entries round trip and malformed data cannot be silently overwritten", () => {
  const entry = { id: "one", type: "expense", amount: 12345, title: "Lunch", category: "อาหาร", date: "2026-09-14", note: "", updatedAt: "2026-09-14T00:00:00Z" };
  assert.equal(readEntries({ getItem: () => JSON.stringify([entry]) }, "key")[0].amount, 12345);
  for (const raw of ["broken", "{}", JSON.stringify([{ ...entry, amount: -100 }]), JSON.stringify([{ ...entry, date: "2026-13-01" }])]) assert.throws(() => readEntries({ getItem: () => raw }, "key"));
});
