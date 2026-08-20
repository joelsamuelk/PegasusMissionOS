import type { FinanceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFinanceRepository(q: Query, deps: Deps): FinanceRepository {
  return {
    async funds(ctx) {
      return notImplemented("finance", "funds");
    },
    async getFund(ctx, id) {
      return notImplemented("finance", "getFund");
    },
    async transactions(ctx) {
      return notImplemented("finance", "transactions");
    },
    async transactionsForFund(ctx, fundId) {
      return notImplemented("finance", "transactionsForFund");
    },
    async getTransaction(ctx, id) {
      return notImplemented("finance", "getTransaction");
    },
    async allocations(ctx) {
      return notImplemented("finance", "allocations");
    },
    async allocationsFor(ctx, entity) {
      return notImplemented("finance", "allocationsFor");
    },
    async budgets(ctx) {
      return notImplemented("finance", "budgets");
    },
    async budgetLines(ctx, budgetId) {
      return notImplemented("finance", "budgetLines");
    },
    async recordTransaction(ctx, input) {
      return notImplemented("finance", "recordTransaction");
    },
    async allocate(ctx, input) {
      return notImplemented("finance", "allocate");
    },
    async allocateShared(ctx, input) {
      return notImplemented("finance", "allocateShared");
    },
    async importStatement(ctx, input) {
      return notImplemented("finance", "importStatement");
    },
    async imports(ctx) {
      return notImplemented("finance", "imports");
    },
    async getImport(ctx, id) {
      return notImplemented("finance", "getImport");
    },
    async candidates(ctx, importId) {
      return notImplemented("finance", "candidates");
    },
    async postCandidates(ctx, importId, acceptedRowNumbers) {
      return notImplemented("finance", "postCandidates");
    },
  };
}
