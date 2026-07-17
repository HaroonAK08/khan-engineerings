const dashboardService = require("./dashboard.service");

async function overview(req, res, next) {
  try {
    const dashboard = await dashboardService.getDashboard();
    res.json({ dashboard });
  } catch (err) {
    next(err);
  }
}

module.exports = { overview };
