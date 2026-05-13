import AwsArchitect from 'aws-architect'
import type { WebsiteDeploymentOptions } from 'aws-architect'

const [, , action, version] = process.argv

if ((action !== 'publish' && action !== 'delete') || !version) {
  console.error('Usage: tsx scripts/deploy-website.ts <publish|delete> <version>')
  console.error('  version: S3 key prefix, e.g. "pr/my-branch" or "main/2026"')
  process.exit(1)
}

const bucket = process.env.SITE_BUCKET_NAME
if (!bucket) {
  console.error('SITE_BUCKET_NAME env var is required')
  process.exit(1)
}

const awsArchitect = new AwsArchitect(
  { name: 'ses-email-adapter-ui', version: '0.0.0' },
  {
    regions: ['eu-west-1'],
    deploymentBucket: bucket,
    sourceDirectory: 'dist',
    description: 'SES Email Adapter UI',
  },
  { bucket, contentDirectory: 'dist' },
)

if (action === 'delete') {
  await awsArchitect.deleteWebsiteVersion(version)
  console.log(`Deleted s3://${bucket}/${version}/`)
} else {
  // PR previews are ephemeral — never cache anything so every push is seen immediately.
  // Main builds use stale-while-revalidate so users get instant responses while the
  // browser quietly refreshes in the background; stale-if-error keeps the site up
  // during brief origin outages.
  const isMain = version.startsWith('main/')
  const swrPolicy = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400'

  const options: WebsiteDeploymentOptions = {
    cacheControlRegexMap: [
      // Content-hashed Vite asset bundles — fingerprinted filenames mean they are
      // safe to cache indefinitely on main; PR builds still get no-store.
      {
        regex: /^assets\//,
        value: isMain ? 'public, max-age=31536000, immutable' : 'no-store',
      },
      // HTML entry points — short SWR on main so updates reach users within 5 min
      // without a blocking round-trip; immediate no-store for PR previews.
      { explicit: 'index.html', value: isMain ? swrPolicy : 'no-store' },
      { explicit: 'manifest.json', value: isMain ? swrPolicy : 'no-store' },
      // Everything else (favicon, robots.txt, etc.)
      { value: isMain ? swrPolicy : 'no-store' },
    ],
  }
  await awsArchitect.publishWebsite(version, options)
  console.log(`Published s3://${bucket}/${version}/`)
}
