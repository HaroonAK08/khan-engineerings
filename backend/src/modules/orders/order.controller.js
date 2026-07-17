const orderService = require("./order.service");

async function create(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body);
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const orders = await orderService.listOrders(req.query);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id);
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.params.id);
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

async function pay(req, res, next) {
  try {
    const result = await orderService.recordPayment({ ...req.body, order: req.params.id });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function payments(req, res, next) {
  try {
    const payments = await orderService.listPayments(req.query);
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

async function dispatch(req, res, next) {
  try {
    const result = await orderService.createDispatch({ ...req.body, order: req.params.id });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function dispatches(req, res, next) {
  try {
    const dispatches = await orderService.listDispatches(req.query);
    res.json({ dispatches });
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const report = await orderService.getSalesReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  list,
  getOne,
  cancel,
  pay,
  payments,
  dispatch,
  dispatches,
  report,
};
