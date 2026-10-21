// NoSQL-injection & parameter-pollution defense.
//
// Attackers frequently try to smuggle MongoDB operators (e.g. `$gt`, `$ne`,
// `$where`) or dotted paths into JSON bodies and query strings so that a value
// intended as a scalar is treated as a query fragment. This middleware:
//   1. Deep-strips any `$`-prefixed or dotted keys from `req.body`.
//   2. Rejects requests whose `req.query` / `req.params` contain object/array
//      values or operator keys (a scalar endpoint should never receive them).
//
// It is intentionally dependency-free and runs before any route handler.

const DANGEROUS_KEY = /[$.[\]]/;

function stripOperators(value) {
  if (Array.isArray(value)) {
    return value.map(stripOperators);
  }
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, nested] of Object.entries(value)) {
      if (DANGEROUS_KEY.test(key)) continue;
      clean[key] = stripOperators(nested);
    }
    return clean;
  }
  return value;
}

function bagIsDangerous(bag) {
  if (!bag || typeof bag !== 'object') return false;
  for (const [key, value] of Object.entries(bag)) {
    if (DANGEROUS_KEY.test(key)) return true;
    if (value !== null && typeof value === 'object') return true;
  }
  return false;
}

const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripOperators(req.body);
  }

  if (bagIsDangerous(req.query) || bagIsDangerous(req.params)) {
    return res.status(400).json({ message: 'Invalid request parameters.' });
  }

  return next();
};

module.exports = { sanitizeRequest, stripOperators };
