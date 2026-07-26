import { and, eq } from "drizzle-orm";
import { getD1Binding, getDb } from ".";
import { impactCents } from "./finance";
import { bills, transactions, transfers } from "./schema";

export type TransactionMutation = {
  accountId: string;
  categoryId: string | null;
  title: string;
  description: string;
  amountCents: number;
  type: "income" | "expense";
  occurredAt: string;
  merchant: string;
  paymentMethod: string;
  tagsJson: string;
  notes: string;
  receiptUrl: string | null;
  location: string | null;
  isRecurring: boolean;
  status: "pending" | "completed" | "cancelled";
};

export type TransferMutation = {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  transferDate: string;
  notes: string;
  status: "pending" | "completed" | "cancelled";
};

export async function createTransaction(
  userId: string,
  id: string,
  input: TransactionMutation,
) {
  const d1 = getD1Binding();
  const activityId = crypto.randomUUID();
  const impact = impactCents(input);
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO transactions (
          id, user_id, account_id, category_id, title, description,
          amount_cents, type, occurred_at, merchant, payment_method,
          tags_json, notes, receipt_url, location, is_recurring, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        input.accountId,
        input.categoryId,
        input.title,
        input.description,
        input.amountCents,
        input.type,
        input.occurredAt,
        input.merchant,
        input.paymentMethod,
        input.tagsJson,
        input.notes,
        input.receiptUrl,
        input.location,
        input.isRecurring ? 1 : 0,
        input.status,
      ),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents + ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(impact, input.accountId, userId),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transaction', ?, 'created', ?, ?)`,
      )
      .bind(
        activityId,
        userId,
        id,
        `${input.type === "income" ? "Income" : "Expense"} added: ${input.title}`,
        JSON.stringify({ amountCents: input.amountCents }),
      ),
  ]);

  return getTransaction(userId, id);
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: TransactionMutation,
) {
  const existing = await getTransaction(userId, id);
  if (!existing) return null;

  const oldImpact = impactCents(existing);
  const newImpact = impactCents(input);
  const d1 = getD1Binding();
  const statements = [
    d1
      .prepare(
        `UPDATE transactions SET
          account_id = ?, category_id = ?, title = ?, description = ?,
          amount_cents = ?, type = ?, occurred_at = ?, merchant = ?,
          payment_method = ?, tags_json = ?, notes = ?, receipt_url = ?,
          location = ?, is_recurring = ?, status = ?,
          updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = ? AND user_id = ?`,
      )
      .bind(
        input.accountId,
        input.categoryId,
        input.title,
        input.description,
        input.amountCents,
        input.type,
        input.occurredAt,
        input.merchant,
        input.paymentMethod,
        input.tagsJson,
        input.notes,
        input.receiptUrl,
        input.location,
        input.isRecurring ? 1 : 0,
        input.status,
        id,
        userId,
      ),
  ];

  if (existing.accountId === input.accountId) {
    statements.push(
      d1
        .prepare(
          `UPDATE accounts
           SET current_balance_cents = current_balance_cents + ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ? AND user_id = ?`,
        )
        .bind(newImpact - oldImpact, input.accountId, userId),
    );
  } else {
    statements.push(
      d1
        .prepare(
          `UPDATE accounts
           SET current_balance_cents = current_balance_cents - ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ? AND user_id = ?`,
        )
        .bind(oldImpact, existing.accountId, userId),
      d1
        .prepare(
          `UPDATE accounts
           SET current_balance_cents = current_balance_cents + ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ? AND user_id = ?`,
        )
        .bind(newImpact, input.accountId, userId),
    );
  }

  statements.push(
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transaction', ?, 'updated', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        id,
        `Transaction updated: ${input.title}`,
        JSON.stringify({ amountCents: input.amountCents }),
      ),
  );

  await d1.batch(statements);
  return getTransaction(userId, id);
}

export async function deleteTransaction(userId: string, id: string) {
  const existing = await getTransaction(userId, id);
  if (!existing) return null;
  const d1 = getD1Binding();
  await d1.batch([
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(impactCents(existing), existing.accountId, userId),
    d1
      .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
      .bind(id, userId),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transaction', ?, 'deleted', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        id,
        `Transaction deleted: ${existing.title}`,
        JSON.stringify({ amountCents: existing.amountCents }),
      ),
  ]);
  return existing;
}

export async function createTransfer(
  userId: string,
  id: string,
  input: TransferMutation,
) {
  const d1 = getD1Binding();
  const amount = input.status === "completed" ? input.amountCents : 0;
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO transfers (
          id, user_id, from_account_id, to_account_id, amount_cents,
          transfer_date, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        input.fromAccountId,
        input.toAccountId,
        input.amountCents,
        input.transferDate,
        input.notes,
        input.status,
      ),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(amount, input.fromAccountId, userId),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents + ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(amount, input.toAccountId, userId),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transfer', ?, 'created', 'Account transfer created', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        id,
        JSON.stringify({
          amountCents: input.amountCents,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
        }),
      ),
  ]);
  return getTransfer(userId, id);
}

export async function updateTransfer(
  userId: string,
  id: string,
  input: TransferMutation,
) {
  const existing = await getTransfer(userId, id);
  if (!existing) return null;
  const oldAmount = existing.status === "completed" ? existing.amountCents : 0;
  const newAmount = input.status === "completed" ? input.amountCents : 0;
  const d1 = getD1Binding();
  await d1.batch([
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents + ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(oldAmount, existing.fromAccountId, userId),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(oldAmount, existing.toAccountId, userId),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(newAmount, input.fromAccountId, userId),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents + ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(newAmount, input.toAccountId, userId),
    d1
      .prepare(
        `UPDATE transfers SET
          from_account_id = ?, to_account_id = ?, amount_cents = ?,
          transfer_date = ?, notes = ?, status = ?,
          updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        input.fromAccountId,
        input.toAccountId,
        input.amountCents,
        input.transferDate,
        input.notes,
        input.status,
        id,
        userId,
      ),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transfer', ?, 'updated', 'Account transfer updated', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        id,
        JSON.stringify({ amountCents: input.amountCents }),
      ),
  ]);
  return getTransfer(userId, id);
}

export async function deleteTransfer(userId: string, id: string) {
  const existing = await getTransfer(userId, id);
  if (!existing) return null;
  const amount = existing.status === "completed" ? existing.amountCents : 0;
  const d1 = getD1Binding();
  await d1.batch([
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents + ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(amount, existing.fromAccountId, userId),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(amount, existing.toAccountId, userId),
    d1
      .prepare("DELETE FROM transfers WHERE id = ? AND user_id = ?")
      .bind(id, userId),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'transfer', ?, 'deleted', 'Account transfer deleted', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        id,
        JSON.stringify({ amountCents: existing.amountCents }),
      ),
  ]);
  return existing;
}

export async function payBill(userId: string, billId: string) {
  const db = getDb();
  const [bill] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
    .limit(1);
  if (!bill) return null;
  if (bill.status === "paid") return { bill, transaction: null };

  const transactionId = crypto.randomUUID();
  const d1 = getD1Binding();
  const paidAt = new Date().toISOString();
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO transactions (
          id, user_id, account_id, category_id, title, description,
          amount_cents, type, occurred_at, merchant, payment_method,
          tags_json, notes, is_recurring, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'expense', ?, ?, 'direct-debit', ?, ?, ?, 'completed')`,
      )
      .bind(
        transactionId,
        userId,
        bill.accountId,
        bill.categoryId,
        bill.name,
        "Bill payment",
        bill.amountCents,
        paidAt,
        bill.name,
        '["bill"]',
        bill.notes,
        bill.frequency !== "once" ? 1 : 0,
      ),
    d1
      .prepare(
        `UPDATE accounts
         SET current_balance_cents = current_balance_cents - ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(bill.amountCents, bill.accountId, userId),
    d1
      .prepare(
        `UPDATE bills
         SET status = 'paid', paid_at = ?,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND user_id = ?`,
      )
      .bind(paidAt, billId, userId),
    d1
      .prepare(
        `INSERT INTO activity (
          id, user_id, entity_type, entity_id, action, summary, metadata_json
        ) VALUES (?, ?, 'bill', ?, 'paid', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        billId,
        `Bill paid: ${bill.name}`,
        JSON.stringify({
          amountCents: bill.amountCents,
          transactionId,
        }),
      ),
  ]);

  const [updatedBill] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
    .limit(1);
  const transaction = await getTransaction(userId, transactionId);
  return { bill: updatedBill ?? bill, transaction };
}

export async function getTransaction(userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getTransfer(userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.id, id), eq(transfers.userId, userId)))
    .limit(1);
  return row ?? null;
}
