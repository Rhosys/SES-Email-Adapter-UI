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
  const options: WebsiteDeploymentOptions = {
    cacheControlRegexMap: [
      // Content-hashed Vite assets — safe to cache forever
      { regex: /^assets\//, value: 'public, max-age=31536000, immutable' },
      // Entry point must always be fetched fresh
      { regex: /index\.html$/, value: 'no-cache, no-store, must-revalidate' },
      // Everything else (manifest.json, favicon, etc.) — short cache
      { value: 'public, max-age=300' },
    ],
  }
  await awsArchitect.publishWebsite(version, options)
  console.log(`Published s3://${bucket}/${version}/`)
}
