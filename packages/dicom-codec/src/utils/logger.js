/**
 * Simple logger instance
 */
const logger = (() => {
  function error(message) {
    console.error(message);
  }

  function log(message) {
    console.log(message);
  }

  return {
    error,
    log,
  };
})();

module.exports = logger;
