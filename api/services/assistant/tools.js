// Tool registry: loading the files registers the tools in toolkit.TOOLS
const toolkit = require('./toolkit');
require('./tools.catalog');
require('./tools.time');
require('./tools.organize');
require('./tools.memory');

const executeTool = async (name, args, ctx) => {
  const executor = toolkit.EXECUTORS[name];
  if (!executor) return toolkit.fail(`Herramienta desconocida: ${name}`);
  try {
    return await executor(args || {}, ctx);
  } catch (error) {
    console.error(`[assistant] tool ${name} failed:`, error);
    return toolkit.fail(error.message);
  }
};

module.exports = { TOOLS: toolkit.TOOLS, executeTool };
