import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.CASHFLOW_TEST_BASE_URL;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  assert.ok(
    response.ok,
    `${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
  );
  return body;
}

test(
  "accounts and transactions survive a backend reload",
  { skip: !baseUrl },
  async () => {
    const initial = await request("");
    const category = initial.categories.find(
      (item) => item.type === "expense",
    );
    assert.ok(category, "An expense category is required for the CRUD test.");

    const marker = `Persistence test ${Date.now()}`;
    const created = await request("/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: marker,
        bankName: "Integration Bank",
        accountType: "Transaction",
        purpose: "custom",
        rule: "",
        openingBalanceCents: 100_000,
        currentBalanceCents: 100_000,
        currency: "AUD",
        color: "#6556E8",
        icon: "IT",
        notes: "Temporary integration record",
        isArchived: false,
      }),
    });
    const accountId = created.item.id;
    let transactionId;

    try {
      const updated = await request(`/accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({
          bankName: "Updated Integration Bank",
          currentBalanceCents: 125_000,
        }),
      });
      assert.equal(updated.item.bankName, "Updated Integration Bank");

      const transaction = await request("/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          categoryId: category.id,
          title: "Integration test expense",
          amountCents: 1_234,
          type: "expense",
          occurredAt: new Date().toISOString(),
          merchant: "Integration Merchant",
          paymentMethod: "card",
          tags: ["integration"],
          notes: "",
          receiptUrl: null,
          location: null,
          isRecurring: false,
          status: "completed",
        }),
      });
      transactionId = transaction.item.id;

      const reloaded = await request("");
      const savedAccount = reloaded.accounts.find(
        (item) => item.id === accountId,
      );
      const savedTransaction = reloaded.transactions.find(
        (item) => item.id === transactionId,
      );

      assert.equal(savedAccount.bankName, "Updated Integration Bank");
      assert.equal(savedAccount.currentBalanceCents, 123_766);
      assert.equal(savedTransaction.title, "Integration test expense");
    } finally {
      if (transactionId) {
        await request(`/transactions/${transactionId}`, { method: "DELETE" });
      }
      await request(`/accounts/${accountId}`, { method: "DELETE" });
    }
  },
);
