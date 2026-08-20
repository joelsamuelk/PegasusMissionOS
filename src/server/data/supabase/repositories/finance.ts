import type { FinanceRepository } from "../../types";
import { type Deps, notImplemented, type Query } from "../query";

export function createFinanceRepository(_q: Query, _deps: Deps): FinanceRepository {
  return {
    async funds(_ctx) {
      return notImplemented("finance", "funds");
    },
    async getFund(_ctx, _id) {
      return notImplemented("finance", "getFund");
    },
    async transactions(_ctx) {
      return notImplemented("finance", "transactions");
    },
    async transactionsForFund(_ctx, _fundId) {
      return notImplemented("finance", "transactionsForFund");
    },
    async getTransaction(_ctx, _id) {
      return notImplemented("finance", "getTransaction");
    },
    async allocations(_ctx) {
      return notImplemented("finance", "allocations");
    },
    async allocationsFor(_ctx, _entity) {
      return notImplemented("finance", "allocationsFor");
    },
    async budgets(_ctx) {
      return notImplemented("finance", "budgets");
    },
    async budgetLines(_ctx, _budgetId) {
      return notImplemented("finance", "budgetLines");
    },
    async recordTransaction(_ctx, _input) {
      return notImplemented("finance", "recordTransaction");
    },
    async allocate(_ctx, _input) {
      return notImplemented("finance", "allocate");
    },
    async allocateShared(_ctx, _input) {
      return notImplemented("finance", "allocateShared");
    },
    async importStatement(_ctx, _input) {
      return notImplemented("finance", "importStatement");
    },
    async imports(_ctx) {
      return notImplemented("finance", "imports");
    },
    async getImport(_ctx, _id) {
      return notImplemented("finance", "getImport");
    },
    async candidates(_ctx, _importId) {
      return notImplemented("finance", "candidates");
    },
    async postCandidates(_ctx, _importId, _acceptedRowNumbers) {
      return notImplemented("finance", "postCandidates");
    },
  };
}
