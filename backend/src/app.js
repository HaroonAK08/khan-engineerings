const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./modules/auth/auth.routes");
const supplierRoutes = require("./modules/suppliers/supplier.routes");
const purchaseRoutes = require("./modules/purchases/purchase.routes");
const ledgerRoutes = require("./modules/ledger/ledger.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");
const productRoutes = require("./modules/products/product.routes");
const productionRoutes = require("./modules/production/production.routes");
const customerRoutes = require("./modules/customers/customer.routes");
const orderRoutes = require("./modules/orders/order.routes");
const financeRoutes = require("./modules/finance/finance.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const reportsRoutes = require("./modules/reports/reports.routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/suppliers/:supplierId/ledger", ledgerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
