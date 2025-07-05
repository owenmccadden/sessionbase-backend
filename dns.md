# DNS Setup - SessionBase

## Overview
Custom domain setup for API Gateway using `api.sessionbase.ai` with domain purchased from GoDaddy.

## Architecture
- **Domain**: `sessionbase.ai` (GoDaddy)
- **DNS**: AWS Route 53
- **SSL**: Certificate for `api.sessionbase.ai` (free)
- **API**: `api.sessionbase.ai` → API Gateway

## CDK Resources Created
- Route 53 hosted zone for `sessionbase.ai`
- SSL certificate for `api.sessionbase.ai`
- API Gateway custom domain mapping
- A record: `api.sessionbase.ai` → API Gateway

## Manual Steps Required

### 1. Certificate Validation (One-time)
When certificate shows "Pending validation":
1. Get CNAME record from AWS Certificate Manager console
2. Add CNAME to GoDaddy DNS:
   - Name: `_[validation-hash].api` (without domain suffix)
   - Value: `_[hash].acm-validations.aws.`
3. Wait 5-30 minutes for validation

### 2. Update Name Servers (One-time)
1. Deploy CDK stack to get Route 53 name servers
2. In GoDaddy, replace name servers with AWS values
3. Wait 24-48 hours for DNS propagation

## Testing
```bash
# Verify DNS
dig api.sessionbase.ai

# Test API
curl https://api.sessionbase.ai/sessions
```

## Cost
- **$0.50/month** for Route 53 hosted zone
- **FREE** SSL certificate

## Future Subdomains
Each new subdomain will need its own SSL certificate and validation process.
