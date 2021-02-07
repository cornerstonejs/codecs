// Internal state for module
const _external = {
  cornerstone: null,
  dicomParser: null,
}

/**
 * 
 */
const externalDependencies = {
  get cornerstone() {
    return _external.cornerstone;
  },
  get dicomParser() {
    return _external.dicomParser;
  }
}

/**
 * 
 * @param {*} extDependencies 
 */
function setExternalDependencies(extDependencies) {
  const { cornerstone, dicomParser } = extDependencies;

  _external.cornerstone = cornerstone;
  _external.dicomParser = dicomParser;
}

export {
  externalDependencies,
  setExternalDependencies
}