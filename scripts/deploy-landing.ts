import AwsArchitect from 'aws-architect'
import type { WebsiteDeploymentOptions } from 'aws-architect'

const [, , action] = process.argv

if (action !== 'publish' && action !== 'delete') {
  console.error('Usage: tsx scripts/deploy-landing.ts <publish|delete>')
  process.exit(1)
}

const bucket = process.env.LANDING_BUCKET_NAME
if (!bucket) {
  console.error('LANDING_BUCKET_NAME env var is required')
  process.exit(1)
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-central-1'

const awsArchitect = new AwsArchitect(
  { name: 'ses-email-adapter-landing', version: '0.0.0' },
  {
    regions: [region],
    deploymentBucket: bucket,
    sourceDirectory: 'landing',
    description: 'SES Email Adapter Landing Page',
  },
  { bucket, contentDirectory: 'landing' },
)

// Landing page deploys under a static versioned prefix
const s3Prefix = 'v1'

if (action === 'delete') {
  await awsArchitect.deleteWebsiteVersion(s3Prefix)
  console.log(`Deleted s3://${bucket}/`)
} else {
  const swrPolicy = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400'

  const options: WebsiteDeploymentOptions = {
    cacheControlRegexMap: [
      { explicit: 'index.html', value: swrPolicy },
      { value: swrPolicy },
    ],
  }
  await awsArchitect.publishWebsite(s3Prefix, options)
  console.log(`Published s3://${bucket}/`)
}
