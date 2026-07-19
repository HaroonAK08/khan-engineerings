const inventoryService = require("./inventory.service");
const purchaseController = require("../purchases/purchase.controller");

async function overview(req, res, next) {
  try {
    const overview = await inventoryService.getOverview();
    res.json({ overview });
  } catch (err) {
    next(err);
  }
}

async function reusable(req, res, next) {
  try {
    const stock = await inventoryService.getReusableStock();
    res.json({ stock });
  } catch (err) {
    next(err);
  }
}

async function finished(req, res, next) {
  try {
    const stock = await inventoryService.getFinishedStock(req.query);
    res.json(stock);
  } catch (err) {
    next(err);
  }
}

async function alerts(req, res, next) {
  try {
    const alerts = await inventoryService.getAlerts();
    res.json({ alerts });
  } catch (err) {
    next(err);
  }
}

async function movements(req, res, next) {
  try {
    const movements = await inventoryService.listMovements(req.query);
    res.json({ movements });
  } catch (err) {
    next(err);
  }
}

async function adjust(req, res, next) {
  try {
    const movement = await inventoryService.createAdjustment(req.body);
    res.status(201).json({ movement });
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const report = await inventoryService.getInventoryReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function listCategories(req, res, next) {
  try {
    const categories = await inventoryService.crudList(
      inventoryService.ProductCategory,
      req.query
    );
    res.json({ categories });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await inventoryService.createCategory(req.body);
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await inventoryService.updateCategory(req.params.id, req.body);
    res.json({ category });
  } catch (err) {
    next(err);
  }
}

async function removeCategory(req, res, next) {
  try {
    await inventoryService.removeCategory(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listSizes(req, res, next) {
  try {
    const sizes = await inventoryService.crudList(inventoryService.ProductSize, req.query);
    res.json({ sizes });
  } catch (err) {
    next(err);
  }
}

async function createSize(req, res, next) {
  try {
    const size = await inventoryService.createSize(req.body);
    res.status(201).json({ size });
  } catch (err) {
    next(err);
  }
}

async function updateSize(req, res, next) {
  try {
    const size = await inventoryService.updateSize(req.params.id, req.body);
    res.json({ size });
  } catch (err) {
    next(err);
  }
}

async function removeSize(req, res, next) {
  try {
    await inventoryService.removeSize(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listWarehouses(req, res, next) {
  try {
    const warehouses = await inventoryService.crudList(inventoryService.Warehouse, req.query);
    res.json({ warehouses });
  } catch (err) {
    next(err);
  }
}

async function createWarehouse(req, res, next) {
  try {
    const warehouse = await inventoryService.createWarehouse(req.body);
    res.status(201).json({ warehouse });
  } catch (err) {
    next(err);
  }
}

async function updateWarehouse(req, res, next) {
  try {
    const warehouse = await inventoryService.updateWarehouse(req.params.id, req.body);
    res.json({ warehouse });
  } catch (err) {
    next(err);
  }
}

async function removeWarehouse(req, res, next) {
  try {
    await inventoryService.removeWarehouse(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function syncHistory(req, res, next) {
  try {
    const result = await inventoryService.syncHistoryFromExisting();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  overview,
  finished,
  reusable,
  alerts,
  movements,
  adjust,
  report,
  stock: purchaseController.stock,
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listSizes,
  createSize,
  updateSize,
  removeSize,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  syncHistory,
};
