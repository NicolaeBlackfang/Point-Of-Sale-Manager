// Pure, dependency-free security helpers shared across the API layer.
//
// Everything in this module is intentionally side-effect free (and free of
// mongoose/express imports) so it can be unit tested in isolation and reused
// by controllers, validators and background workers alike.

// ---------------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------------

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Enforces the store password policy on PLAINTEXT passwords.
 *
 * The mongoose `minlength` validator on User.password is useless (it runs
 * against the bcrypt hash, which is always 60 characters), so the real policy
 * has to be enforced in the request layer — this is that policy.
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string' || !password) {
    return { ok: false, error: 'Password is required.' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
    };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, error: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: 'Password must contain at least one number.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

// Staff accounts that a Superadmin may create or re-assign. Superadmin
// accounts are never creatable through the staff-management endpoints.
const MANAGED_STAFF_ROLES = ['Operator', 'Cashier'];

/**
 * Normalises a requested staff role and rejects anything that is not a
 * managed staff role (e.g. "Superadmin").
 */
function normalizeStaffRole(role) {
  if (typeof role !== 'string' || !role.trim()) {
    return { ok: false, error: 'Role must be Operator or Cashier.' };
  }
  const normalized = role.trim().charAt(0).toUpperCase() + role.trim().slice(1).toLowerCase();
  if (!MANAGED_STAFF_ROLES.includes(normalized)) {
    return { ok: false, error: 'Role must be Operator or Cashier.' };
  }
  return { ok: true, role: normalized };
}

// ---------------------------------------------------------------------------
// Object IDs
// ---------------------------------------------------------------------------

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Strict 24-hex ObjectId check (rejects anything mongoose would choke on). */
function isValidObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value.trim());
}

// ---------------------------------------------------------------------------
// Sale payload limits
// ---------------------------------------------------------------------------

// A single checkout may not contain more than this many lines.
const MAX_SALE_ITEMS = 200;
// ...nor may a single line request more units than this.
const MAX_ITEM_QUANTITY = 1000;

/**
 * Validates and normalises the item list of a sale request. Prices are never
 * accepted from the client — only product references and quantities.
 */
function normalizeSaleItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'No items in sale transaction.' };
  }
  if (items.length > MAX_SALE_ITEMS) {
    return {
      ok: false,
      error: `A sale can contain at most ${MAX_SALE_ITEMS} items.`,
    };
  }

  const normalized = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Invalid item in sale transaction.' };
    }
    const productId = String(item.product || item._id || '').trim();
    const quantity = Number(item.quantity);

    if (!isValidObjectIdString(productId)) {
      return { ok: false, error: 'Invalid item in sale transaction.' };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { ok: false, error: 'Invalid item in sale transaction.' };
    }
    if (quantity > MAX_ITEM_QUANTITY) {
      return {
        ok: false,
        error: `A single sale line is limited to ${MAX_ITEM_QUANTITY} units.`,
      };
    }
    normalized.push({ productId, quantity });
  }
  return { ok: true, items: normalized };
}

// ---------------------------------------------------------------------------
// Outbound URL safety (SSRF)
// ---------------------------------------------------------------------------

// Hostnames that always resolve to the local machine or a cloud metadata
// service.
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true; // not a parsable IPv4 literal -> treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fe80')) return true; // link-local
  if (value.startsWith('fc') || value.startsWith('fd')) return true; // unique local
  if (value.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:127.0.0.1) — validate the embedded IPv4 address.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(address) {
  if (!address) return true;
  const value = String(address).trim();
  if (value.includes(':')) return isPrivateIPv6(value);
  return isPrivateIPv4(value);
}

/**
 * Validates a URL that the SERVER is going to request (webhooks, callbacks).
 *
 * Blocks non-HTTP(S) schemes, embedded credentials and any host that points
 * at the local machine, a private network or a cloud metadata endpoint.
 */
function isSafeOutboundUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'A URL is required.' };
  }
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Enter a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs are allowed.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'URLs with embedded credentials are not allowed.' };
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    return { ok: false, error: 'Enter a valid URL.' };
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, error: 'This host is not allowed.' };
  }
  // IP literals are rejected outright unless they are public addresses.
  const isIpv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isIpv6Literal = hostname.includes(':');
  if (isIpv4Literal || isIpv6Literal) {
    if (isPrivateAddress(hostname)) {
      return { ok: false, error: 'This host is not allowed.' };
    }
  }
  return { ok: true, url: url.toString() };
}

/**
 * Resolves a hostname and verifies that every address it points at is public.
 * Used right before a request is made so DNS-based rebinding cannot smuggle a
 * request into the private network.
 */
async function assertPublicHost(rawUrl) {
  const check = isSafeOutboundUrl(rawUrl);
  if (!check.ok) return check;

  const url = new URL(check.url);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  if (isIpLiteral) return check; // already validated as a public literal

  let addresses = [];
  try {
    const dns = require('dns');
    const resolved = await dns.promises.lookup(hostname, { all: true });
    addresses = (resolved || []).map((entry) => entry.address);
  } catch {
    return { ok: false, error: 'The host could not be resolved.' };
  }
  if (!addresses.length) {
    return { ok: false, error: 'The host could not be resolved.' };
  }
  if (addresses.some((address) => isPrivateAddress(address))) {
    return { ok: false, error: 'This host is not allowed.' };
  }
  return check;
}

// ---------------------------------------------------------------------------
// SMTP settings (command / header injection)
// ---------------------------------------------------------------------------

// A hostname or IP literal — no scheme, path, port or whitespace. Anything
// else could smuggle extra commands into the SMTP conversation.
const SMTP_HOST_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;
// Control characters (CR/LF in particular) terminate or split SMTP commands.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validates the SMTP host configured in the store settings.
 *
 * Private addresses are deliberately allowed here (on-premise stores commonly
 * run a relay on the LAN); the value is only ever used as a TCP target, and
 * the format check already prevents protocol smuggling.
 */
function isValidSmtpHost(host) {
  if (typeof host !== 'string') return false;
  const value = host.trim();
  if (!value || value.length > 255) return false;
  if (CONTROL_CHARS.test(value)) return false;
  if (value.includes('..')) return false;
  if (!SMTP_HOST_PATTERN.test(value)) return false;
  // A bare IPv4 literal is fine; a hostname must have a label structure.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  return value.includes('.') || value === 'localhost';
}

/**
 * Removes CR/LF and other control characters from a value that is about to be
 * written into an SMTP header or command line.
 */
function sanitizeSmtpValue(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(CONTROL_CHARS, '')
    .trim();
}

/**
 * Validates a value that will be used as an SMTP envelope sender.
 * Returns the cleaned value or an error.
 */
function validateSmtpIdentity(value) {
  const cleaned = sanitizeSmtpValue(value);
  if (!cleaned) return { ok: false, error: 'A value is required.' };
  if (cleaned.length > 255) return { ok: false, error: 'Value is too long (max 255 characters).' };
  if (/[<>]/.test(cleaned)) return { ok: false, error: 'Value must not contain < or >.' };
  return { ok: true, value: cleaned };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  MANAGED_STAFF_ROLES,
  MAX_SALE_ITEMS,
  MAX_ITEM_QUANTITY,
  validatePasswordStrength,
  normalizeStaffRole,
  isValidObjectIdString,
  normalizeSaleItems,
  isPrivateAddress,
  isSafeOutboundUrl,
  assertPublicHost,
  isValidSmtpHost,
  sanitizeSmtpValue,
  validateSmtpIdentity,
};
