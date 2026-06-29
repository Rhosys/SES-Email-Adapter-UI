import AwsArchitect from 'aws-architect'
import type { WebsiteDeploymentOptions } from 'aws-architect'

const [, , action, version] = process.argv

if (action !== 'publish') {
  console.error('Usage: tsx scripts/deploy-website.ts publish <version>')
  console.error('  version: "main" for root deployment, or "pr/my-branch" for PR previews')
  process.exit(1)
}

if (!version) {
  console.error('Error: version argument is required. Use "main" for the root deployment.')
  process.exit(1)
}

const bucket = process.env.SITE_BUCKET_NAME
if (!bucket) {
  console.error('SITE_BUCKET_NAME env var is required')
  process.exit(1)
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-central-1'

const awsArchitect = new AwsArchitect(
  { name: 'ses-email-adapter-ui', version: '0.0.0' },
  {
    regions: [region],
    deploymentBucket: bucket,
    sourceDirectory: 'dist',
    description: 'SES Email Adapter UI',
  },
  { bucket, contentDirectory: 'dist' },
)

// 'main' is the canonical version key for the root S3 deployment (CloudFront /).
// PR previews use 'pr/<slug>' which maps directly to an S3 prefix.
const isMain = version === 'main'
const s3Prefix = isMain ? '' : version

// PR previews are ephemeral — never cache anything so every push is seen immediately.
// Main builds use stale-while-revalidate so users get instant responses while the
// browser quietly refreshes in the background; stale-if-error keeps the site up
// during brief origin outages.

const swrPolicy = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400'

const options: WebsiteDeploymentOptions = {
  cacheControlRegexMap: [
    // Content-hashed Vite bundles — fingerprinted filenames are safe to cache forever.
    // CloudFront serves /assets/* from a dedicated origin with its own cache policy.
    {
      regex: /^assets\//,
      value: isMain ? 'public, max-age=31536000, immutable' : 'no-store',
    },
    // HTML entry point — short SWR so updates reach users within 5 min.
    { explicit: 'index.html', value: isMain ? swrPolicy : 'no-store' },
    // PWA service worker + its registration shim — never cache so a new SW is
    // discovered on the very next visit and updates activate promptly.
    { explicit: 'sw.js', value: isMain ? 'public, max-age=0, must-revalidate' : 'no-store' },
    {
      explicit: 'registerSW.js',
      value: isMain ? 'public, max-age=0, must-revalidate' : 'no-store',
    },
    // Web app manifest — same cadence as HTML.
    { explicit: 'manifest.json', value: isMain ? swrPolicy : 'no-store' },
    // Favicon has no content hash — cache for 1 day on main, bust on next deploy.
    { explicit: 'favicon.svg', value: isMain ? 'public, max-age=86400' : 'no-store' },
    // Catch-all (robots.txt, etc.)
    { value: isMain ? swrPolicy : 'no-store' },
  ],
}
await awsArchitect.publishWebsite(s3Prefix, options)
console.log(`Published s3://${bucket}/${s3Prefix || '(root)'}/`)
