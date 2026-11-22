const { createHash } = require('node:crypto');
exports.tokenDigest = (token) => createHash('sha256').update(token).digest('hex');
