/* global VERSION_INFO, DEPLOYMENT_INFO */

export default {
  version: {
    releaseDate: VERSION_INFO.releaseDate,
    buildNumber: VERSION_INFO.buildNumber,
    buildRef: VERSION_INFO.buildRef,
    buildCommit: VERSION_INFO.buildCommit,
  },
  deployment: {
    fdqn: DEPLOYMENT_INFO.FDQN || 'localhost',
    logTarget: DEPLOYMENT_INFO.LOG_TARGET || 'LOCAL',
  },
}
