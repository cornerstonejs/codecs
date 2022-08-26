const { isNode, isBrowser } = require("browser-or-node");
/**
 * Wrapper for process timer to capture process timestamp.
 *
 * @param {string} processName name of process.
 * @param {Logger} loggerInstance logger instance.
 * @returns object containing methods to register timestamps and get process duration.
 */
function processTimer(processName, loggerInstance) {
  // array of [ms, ns] representing initial timestamp
  let processInitTime;
  // array of [ms, ns] representing diff timestamp
  let processDurationTime;
  const NS_SEC = 1000000000;

  function hrtime(previousTime) {
    // node
    if (isNode) {
      if (previousTime) {
        return process.hrtime(previousTime);
      } else {
        return process.hrtime();
      }
    }

    // browser
    if (isBrowser) {
      if (previousTime) {
        return [Math.abs(window.performance.now() - previousTime[0]), 0];
      } else {
        return [window.performance.now(), 0];
      }
    }

    return 0;
  }

  function hrTimeToMS(time) {
    return time[0] + time[1] / NS_SEC;
  }

  function init(preMessage, postMessage) {
    if (processInitTime) {
      loggerInstance.log(processName + " already started");

      return;
    }

    processInitTime = hrtime();

    if (preMessage) {
      loggerInstance.log(preMessage);
    }
    loggerInstance.log(processName + " process started");

    if (postMessage) {
      loggerInstance.log(postMessage);
    }
  }

  function end(preMessage, postMessage) {
    if (!processInitTime) {
      loggerInstance.log(processName + " is not yet started");

      return;
    }

    if (processDurationTime) {
      loggerInstance.log(processName + " already finished");

      return;
    }

    processDurationTime = hrtime(processInitTime);

    if (preMessage) {
      loggerInstance.log(preMessage);
    }

    loggerInstance.log(
      processName +
        " process finished: " +
        hrTimeToMS(processDurationTime) +
        "ms"
    );

    if (postMessage) {
      loggerInstance.log(postMessage);
    }
  }

  function getDuration() {
    return hrTimeToMS(processDurationTime);
  }

  return {
    end,
    init,
    getDuration,
  };
}

module.exports = processTimer;
