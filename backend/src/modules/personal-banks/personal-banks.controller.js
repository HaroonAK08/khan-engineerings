const service = require("./personal-banks.service");

async function status(req, res, next) {
  try {
    res.json(await service.authStatus());
  } catch (err) {
    next(err);
  }
}

async function setup(req, res, next) {
  try {
    res.status(201).json(await service.setupPin(req.body.pin));
  } catch (err) {
    next(err);
  }
}

async function unlock(req, res, next) {
  try {
    res.json(await service.unlock(req.body.pin));
  } catch (err) {
    next(err);
  }
}

async function changePin(req, res, next) {
  try {
    res.json(await service.changePin(req.body));
  } catch (err) {
    next(err);
  }
}

async function resetPin(req, res, next) {
  try {
    res.json(await service.resetPin(req.body));
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    res.json(await service.summary());
  } catch (err) {
    next(err);
  }
}

async function listBanks(req, res, next) {
  try {
    const banks = await service.listBanks();
    res.json({ banks });
  } catch (err) {
    next(err);
  }
}

async function createBank(req, res, next) {
  try {
    const bank = await service.createBank(req.body);
    res.status(201).json({ bank });
  } catch (err) {
    next(err);
  }
}

async function updateBank(req, res, next) {
  try {
    const bank = await service.updateBank(req.params.id, req.body);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
}

async function removeBank(req, res, next) {
  try {
    res.json(await service.removeBank(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function listAccounts(req, res, next) {
  try {
    const accounts = await service.listAccounts(req.query);
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
}

async function createAccount(req, res, next) {
  try {
    const account = await service.createAccount(req.body);
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
}

async function updateAccount(req, res, next) {
  try {
    const account = await service.updateAccount(req.params.id, req.body);
    res.json({ account });
  } catch (err) {
    next(err);
  }
}

async function removeAccount(req, res, next) {
  try {
    res.json(await service.removeAccount(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function deposit(req, res, next) {
  try {
    res.status(201).json(await service.deposit(req.body));
  } catch (err) {
    next(err);
  }
}

async function send(req, res, next) {
  try {
    res.status(201).json(await service.send(req.body));
  } catch (err) {
    next(err);
  }
}

async function listTransactions(req, res, next) {
  try {
    const transactions = await service.listTransactions(req.query);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

async function listPeople(req, res, next) {
  try {
    const people = await service.listPeople(req.query);
    res.json({ people });
  } catch (err) {
    next(err);
  }
}

async function renamePerson(req, res, next) {
  try {
    res.json(await service.renamePerson(req.body));
  } catch (err) {
    next(err);
  }
}

async function removePerson(req, res, next) {
  try {
    const name = req.query.name || req.body?.name;
    res.json(await service.removePerson({ name }));
  } catch (err) {
    next(err);
  }
}

async function updateTransaction(req, res, next) {
  try {
    const transaction = await service.updateTransaction(req.params.id, req.body);
    res.json({ transaction });
  } catch (err) {
    next(err);
  }
}

async function removeTransaction(req, res, next) {
  try {
    res.json(await service.removeTransaction(req.params.id));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  status,
  setup,
  unlock,
  changePin,
  resetPin,
  summary,
  listBanks,
  createBank,
  updateBank,
  removeBank,
  listAccounts,
  createAccount,
  updateAccount,
  removeAccount,
  deposit,
  send,
  listTransactions,
  listPeople,
  renamePerson,
  removePerson,
  updateTransaction,
  removeTransaction,
};
