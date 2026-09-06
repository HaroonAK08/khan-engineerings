function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseDiscountAmount(raw, subtotal) {
  const sub = roundMoney(subtotal);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundMoney(Math.min(n, sub));
}

function applyDiscount(subtotal, discountInput) {
  const sub = roundMoney(subtotal);
  const discountAmount = parseDiscountAmount(discountInput, sub);
  return {
    subtotal: sub,
    discountAmount,
    totalAmount: roundMoney(Math.max(0, sub - discountAmount)),
  };
}

function withNetLineTotal(unwindOptions = {}) {
  return [
    {
      $addFields: {
        _lineSubtotal: { $sum: "$items.lineTotal" },
        _discountAmount: { $ifNull: ["$discountAmount", 0] },
      },
    },
    { $unwind: { path: "$items", preserveNullAndEmptyArrays: false, ...unwindOptions } },
    {
      $addFields: {
        "items.netLineTotal": {
          $cond: [
            { $gt: ["$_lineSubtotal", 0] },
            {
              $multiply: [
                { $ifNull: ["$items.lineTotal", 0] },
                {
                  $subtract: [1, { $divide: ["$_discountAmount", "$_lineSubtotal"] }],
                },
              ],
            },
            { $ifNull: ["$items.lineTotal", 0] },
          ],
        },
      },
    },
  ];
}

module.exports = {
  roundMoney,
  parseDiscountAmount,
  applyDiscount,
  withNetLineTotal,
};
