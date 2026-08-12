# Deploying Termine on AWS (App Runner + RDS)

This template runs Termine on [App Runner](https://aws.amazon.com/apprunner/)
(a managed container platform - no EC2/ECS cluster to operate) backed by a
private [RDS PostgreSQL](https://aws.amazon.com/rds/postgresql/) instance
reachable only through a VPC connector, never exposed to the public internet.

Template: [`apprunner-rds.yaml`](./apprunner-rds.yaml)

## Prerequisites

- AWS CLI configured with credentials that can create IAM roles, RDS, App Runner, and EC2 security group resources
- Docker installed locally
- Your account's default VPC ID and at least two of its subnet IDs (in different AZs)

Find your default VPC and subnets:

```bash
aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text
aws ec2 describe-subnets --filters "Name=vpc-id,Values=<vpc-id-from-above>" --query 'Subnets[*].SubnetId' --output text
```

## 1. Build and push the image to ECR

```bash
aws ecr create-repository --repository-name termine
aws ecr get-login-password --region <your-region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<your-region>.amazonaws.com

docker build -t termine .
docker tag termine:latest <account-id>.dkr.ecr.<your-region>.amazonaws.com/termine:latest
docker push <account-id>.dkr.ecr.<your-region>.amazonaws.com/termine:latest
```

## 2. Deploy the stack

```bash
aws cloudformation deploy \
  --template-file deploy/aws/apprunner-rds.yaml \
  --stack-name termine \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ImageUri=<account-id>.dkr.ecr.<your-region>.amazonaws.com/termine:latest \
    VpcId=<vpc-id> \
    SubnetIds=<subnet-id-1>,<subnet-id-2> \
    DBPassword="$(openssl rand -base64 24 | tr -d '=+/')" \
    SessionSecret="$(openssl rand -hex 32)"
```

This provisions real, billable AWS resources: an App Runner service, an RDS
`db.t4g.micro` instance, a VPC connector, and supporting security groups.

## 3. Set PUBLIC_URL and redeploy

```bash
aws cloudformation describe-stacks --stack-name termine --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text
```

Redeploy the stack with `PublicUrl=<that-url>` added to `--parameter-overrides`
(or attach a custom domain via App Runner's console first, then use that).

Visit the URL - you'll land on the first-run admin setup wizard.

## Updating after a code change

```bash
docker build -t termine .
docker tag termine:latest <account-id>.dkr.ecr.<your-region>.amazonaws.com/termine:latest
docker push <account-id>.dkr.ecr.<your-region>.amazonaws.com/termine:latest
aws apprunner start-deployment --service-arn <service-arn-from-stack-outputs>
```

`docker-entrypoint.sh` runs `prisma migrate deploy` automatically before the
server starts, so schema changes apply on their own.

## A network trade-off, stated plainly

The App Runner service's VPC connector routes **all** of its outbound traffic
through your VPC. This template uses your default VPC's existing subnets
without adding a NAT Gateway, which keeps the stack simple and avoids NAT
Gateway's hourly cost - but it means the app has **no general internet
egress** while the connector is attached. RDS access still works fine (that
traffic never leaves the VPC), but if you plan to enable S3-compatible
storage (`STORAGE_DRIVER=s3`) or Cloudflare Turnstile, either:

- Add a NAT Gateway + route table entry for these subnets, or
- Skip the VPC connector and use a publicly accessible RDS instance with a
  security group restricted to App Runner's published IP ranges instead
  (simpler, but a larger network exposure than this template's default).

## Costs

App Runner, RDS, and the VPC connector are all billable AWS resources.
Review current AWS pricing for your region before deploying.
