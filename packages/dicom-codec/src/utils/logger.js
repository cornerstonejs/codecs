let verbose = false
/**
 * Simple logger instance
 */
const logger = (() => {
  function error(message) {
    if(verbose) {
      console.error(message);
    }
  }

  function log(message) {
    if(verbose) {
      console.log(message);
    }
  }

  function setVerbose() {
    verbose = true;
  }

  return {
    error,
    log,
    setVerbose
  };
})();

module.exports = logger;
