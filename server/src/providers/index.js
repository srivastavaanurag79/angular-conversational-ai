const { config } = require("../config");
const openai = require("./openai");
const mock = require("./mock");

const provider = config.openai.apiKey ? openai : mock;

module.exports = { provider, providerName: provider.name };
