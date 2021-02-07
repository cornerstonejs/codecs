import { setExternalDependencies } from './externalDependencies';
import registerImageLoaders from './imageLoader/registerImageLoaders';

function init(configuration, registerLoaders = false) {
  const { cornerstone, dicomParser } = configuration;

  setExternalDependencies({ cornerstone, dicomParser })
  
  if (registerLoaders) {
    registerImageLoaders(cornerstone);
  }
}

export default init;


// TODO:
// Top level exports:
// - Loaders
// - Metadata providers
// - init
// - A way to register decode / transferSyntax links?
// - Default method that registers all DICOM codecs + transfer syntaxes?
// TODO:
// - Consistent interface for codec
// - ???
