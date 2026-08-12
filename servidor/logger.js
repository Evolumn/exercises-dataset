function serialize(level, message, fields = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  });
}

function info(message, fields) {
  console.log(serialize('info', message, fields));
}

function warn(message, fields) {
  console.warn(serialize('warn', message, fields));
}

function error(message, fields) {
  console.error(serialize('error', message, fields));
}

module.exports = { info, warn, error };
