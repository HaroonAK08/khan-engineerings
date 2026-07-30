function dayRange(date) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function wantsConfirmDuplicate(data = {}) {
  return (
    data.confirmDuplicate === true ||
    data.confirmDuplicate === "true" ||
    data.force === true ||
    data.force === "true"
  );
}

function sameDayDuplicateError(message) {
  const err = new Error(
    message ||
      "Trying to create a duplicate entry on the same day. Do you want to continue?"
  );
  err.statusCode = 409;
  err.code = "SAME_DAY_DUPLICATE";
  return err;
}

module.exports = {
  dayRange,
  wantsConfirmDuplicate,
  sameDayDuplicateError,
};
