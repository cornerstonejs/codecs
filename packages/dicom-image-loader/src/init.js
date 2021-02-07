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
