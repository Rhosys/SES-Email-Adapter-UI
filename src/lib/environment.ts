import buildInfo from './buildInfo'

function getEnvironment() {
  if (typeof window === 'undefined' || !window?.location) return null
  if (
    window.location.hostname === buildInfo.deployment.fdqn &&
    window.location.hostname !== 'localhost'
  ) {
    return 'production'
  }
  if (
    window.location.hostname === `tst.${buildInfo.deployment.fdqn}` &&
    window.location.pathname.includes('/PR')
  ) {
    return 'pull-request'
  }
  if (window.location.hostname === `tst.${buildInfo.deployment.fdqn}`) {
    return 'test'
  }
  return 'development'
}

export default getEnvironment()
