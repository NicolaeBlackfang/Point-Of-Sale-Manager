// Minimal SMTP client (STARTTLS / implicit TLS / AUTH LOGIN) with zero
// third-party dependencies. Used for optional low-stock and daily-report
// notifications configured through store settings.

const net = require('net');
const tls = require('tls');
const { sanitizeSmtpValue } = require('./security');

const SOCKET_TIMEOUT_MS = 15000;

function isConfigured(settings = {}) {
  return Boolean(settings.smtpHost && settings.emailRecipient);
}

function encodeHeader(value) {
  const text = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function buildMessage({ from, to, subject, text, date = new Date() }) {
  const body = Buffer.from(String(text || ''), 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${sanitizeSmtpValue(from)}`,
    `To: ${sanitizeSmtpValue(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '',
    '.',
    '',
  ].join('\r\n');
}

function createSession(initialSocket) {
  let socket = initialSocket;
  let buffer = '';
  let pending = null;
  let closed = false;

  function tryResolve() {
    if (!pending) return;
    // Final SMTP reply line uses "<code> <text>"; continuations use "<code>-".
    const lines = buffer.split('\n');
    let finalIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\d{3} /.test(lines[i])) {
        finalIndex = i;
        break;
      }
    }
    if (finalIndex === -1) return;
    const consumed = `${lines.slice(0, finalIndex + 1).join('\n')}\n`;
    buffer = buffer.slice(consumed.length);
    resolvePending({ text: consumed });
  }

  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    tryResolve();
  };
  const onClose = () => {
    closed = true;
    fail(new Error('SMTP connection closed.'));
  };

  function fail(err) {
    if (!pending) return;
    const { reject } = pending;
    pending = null;
    reject(err);
  }

  function resolvePending(value) {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    resolve(value);
  }

  function attach(next) {
    socket = next;
    buffer = '';
    next.setTimeout(SOCKET_TIMEOUT_MS, () => fail(new Error('SMTP socket timed out.')));
    next.on('data', onData);
    next.on('error', fail);
    next.on('close', onClose);
  }

  attach(initialSocket);

  return {
    readReply() {
      if (closed) return Promise.reject(new Error('SMTP connection closed.'));
      if (pending) return Promise.reject(new Error('SMTP reply already pending.'));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        tryResolve();
      });
    },
    write(payload) {
      socket.write(payload);
    },
    async upgradeTls(servername) {
      // Detach plain-socket listeners before the TLS layer takes over.
      socket.removeAllListeners('data');
      socket.removeAllListeners('close');
      socket.removeAllListeners('timeout');
      socket.on('error', () => {});
      const secure = await new Promise((resolve, reject) => {
        const next = tls.connect({ socket, servername }, () => resolve(next));
        next.once('error', reject);
      });
      attach(secure);
    },
    close() {
      closed = true;
      pending = null;
      try {
        socket.end();
      } catch {
        // already closed
      }
    },
  };
}

async function expect(sess, codes, step) {
  const reply = await sess.readReply();
  const code = Number(String(reply.text).slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`${step} failed (${code}): ${String(reply.text).trim().slice(0, 200)}`);
  }
  return { code, text: reply.text };
}

function connectSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const options = { host, port };
    const socket = secure
      ? tls.connect(options, () => resolve(socket))
      : net.connect(options, () => resolve(socket));
    socket.once('error', reject);
  });
}

async function sendMail(settings, { subject, text, from } = {}) {
  const host = sanitizeSmtpValue(settings.smtpHost);
  const port = Number(settings.smtpPort) || 587;
  const user = sanitizeSmtpValue(settings.smtpUser);
  const pass = settings.smtpPass || '';
  const recipient = sanitizeSmtpValue(settings.emailRecipient);
  const sender = sanitizeSmtpValue(from || user || `no-reply@${host}`);

  if (!host) return { ok: false, error: 'SMTP host is not configured.' };
  if (!recipient) return { ok: false, error: 'E-mail recipient is not configured.' };
  if (!sender) return { ok: false, error: 'SMTP sender is not configured.' };

  let sess;
  try {
    const socket = await connectSocket({ host, port, secure: port === 465 });
    sess = createSession(socket);

    await expect(sess, [220], 'SMTP greeting');
    sess.write(`EHLO ${host}\r\n`);
    const ehlo = await expect(sess, [250], 'EHLO');

    if (port !== 465 && ehlo.text.toUpperCase().includes('STARTTLS')) {
      sess.write('STARTTLS\r\n');
      await expect(sess, [220], 'STARTTLS');
      await sess.upgradeTls(host);
      sess.write(`EHLO ${host}\r\n`);
      await expect(sess, [250], 'EHLO after STARTTLS');
    }

    if (user) {
      sess.write('AUTH LOGIN\r\n');
      await expect(sess, [334], 'AUTH LOGIN');
      sess.write(`${Buffer.from(user, 'utf8').toString('base64')}\r\n`);
      await expect(sess, [334], 'AUTH username');
      sess.write(`${Buffer.from(pass, 'utf8').toString('base64')}\r\n`);
      await expect(sess, [235], 'AUTH password');
    }

    sess.write(`MAIL FROM:<${sender}>\r\n`);
    await expect(sess, [250], 'MAIL FROM');
    sess.write(`RCPT TO:<${recipient}>\r\n`);
    await expect(sess, [250, 251], 'RCPT TO');
    sess.write('DATA\r\n');
    await expect(sess, [354], 'DATA');
    sess.write(buildMessage({ from: sender, to: recipient, subject, text }));
    await expect(sess, [250], 'message delivery');
    sess.write('QUIT\r\n');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    if (sess) sess.close();
  }
}

// Sends a notification when SMTP settings are present and the caller says the
// relevant toggle is enabled; silently skips otherwise (never throws).
async function sendSettingsEmail(settings, { subject, text, from, enabled = true } = {}) {
  if (!enabled) return { ok: false, skipped: true, reason: 'notification disabled' };
  if (!isConfigured(settings)) {
    return { ok: false, skipped: true, reason: 'smtp settings incomplete' };
  }
  return sendMail(settings, { subject, text, from });
}

module.exports = { sendMail, sendSettingsEmail, buildMessage, isConfigured, encodeHeader };
