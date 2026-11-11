// Vercel Serverless Function entrypoint for the Reclaim backend API.
// All /api/* requests are rewritten here (see vercel.json) and handled by backend/server.js.
const backend = require('../backend/server.js');

module.exports = (req, res) => backend(req, res);
