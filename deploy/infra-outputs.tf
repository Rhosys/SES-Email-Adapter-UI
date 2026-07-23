# Reads infrastructure outputs from the backend deploy state.
# CI runs `tofu -chdir=deploy init && tofu -chdir=deploy output -raw <name>`
# to resolve bucket names and distribution ID at deploy time.

variable "aws_account_id" {
  description = "AWS account ID — injected via TF_VAR_aws_account_id in CI"
  type        = string
}

data "terraform_remote_state" "backend" {
  backend = "s3"
  config = {
    bucket = "rhosys-opentofu-${var.aws_account_id}-eu-central-1"
    key    = "SES-Email-Adapter/terraform.tfstate"
    region = "eu-central-1"
  }
}

output "site_bucket_name" {
  value = data.terraform_remote_state.backend.outputs.site_bucket_name
}

output "landing_bucket_name" {
  value = data.terraform_remote_state.backend.outputs.landing_bucket_name
}

output "cloudfront_distribution_id" {
  value = data.terraform_remote_state.backend.outputs.cloudfront_distribution_id
}
