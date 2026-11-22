/**
 * Recomputes mfgLossAmount on existing rework claims.
 *
 * Earlier claims derived the non-material cost from Product.standardCost, which
 * only ever contained raw material (batch-linked expenses are empty, so the
 * operating-cost term was always zero). Those claims understate the real loss.
 * This rebuilds them with the Finance overhead-per-kg rate and keeps the
 * claim_rework FinanceEntry in step.
 *
 * Run with --dry-run to preview without writing.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Claim = require("../modules/claims/claim.model");
const FinanceEntry = require("../modules/finance/finance.model");
const claimService = require("../modules/claims/claim.service");

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();

  const claims = await Claim.find({ status: { $ne: "cancelled" } });
  let changed = 0;

  for (const claim of claims) {
    if (!(claim.items || []).some((item) => item.disposition === "rework")) continue;

    const items = claim.items.map((item) => item.toObject());
    const before = roundMoney(claim.mfgLossAmount);
    const after = roundMoney(await claimService.computeReworkManufacturingLoss(items));
    if (Math.abs(before - after) <= 0.009) continue;

    console.log(`${claim.claimNo}: ${before} -> ${after}`);
    changed += 1;
    if (dryRun) continue;

    claim.items = items;
    claim.mfgLossAmount = after;
    await claim.save();

    await FinanceEntry.deleteMany({
      category: "claim_rework",
      reference: claim.claimNo,
    });
    if (after > 0.001) {
      await FinanceEntry.create({
        type: "expense",
        category: "claim_rework",
        amount: after,
        entryDate: claim.claimDate,
        reference: claim.claimNo,
        notes: `Rework loss (overhead + metal not recovered) · Claim ${claim.claimNo}`,
      });
    }
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${changed} claim(s).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
