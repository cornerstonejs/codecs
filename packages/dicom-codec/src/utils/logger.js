let verbose = false;

/**
 * Simple logger instance
 *
 * @typedef Logger
 * @type {object}
 * @property {Function} error - function to log an error message.
 * @property {Function} log - function to log an message.
 * @property {Function} setVerbose - set logger to verbose mode.
 */

/**
 * @type {Logger}
 */
const logger = (() => {
  function error(message) {
    if (verbose) {
      console.error(message);
    }
  }

  function log(message) {
    if (verbose) {
      console.log(message);
    }
  }

  function setVerbose(newVerbose = true) {
    verbose = newVerbose;
  }

  return {
    error,
    log,
    setVerbose,
  };
})();

module.exports = logger;
