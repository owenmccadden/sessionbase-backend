import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apiGW from 'aws-cdk-lib/aws-apigatewayv2';
import * as apiGWIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as certificateManager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for session content storage
    const sessionBucket = new s3.Bucket(this, 'sessionBucket');

    // DynamoDB table for session metadata
    const sessionMetadataTable = new dynamodb.Table(this, 'SessionMetadataTable', {
      tableName: 'SessionMetadata',
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect against accidental deletion
    });

    // Add Global Secondary Index for querying by user
    sessionMetadataTable.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // DynamoDB table for user metadata
    const userMetadataTable = new dynamodb.Table(this, 'UserMetadataTable', {
      tableName: 'UserMetadata',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect against accidental deletion
    });

    // DynamoDB table for teams email signups
    const teamsEmailSignupsTable = new dynamodb.Table(this, 'TeamsEmailSignupsTable', {
      tableName: 'TeamsEmailSignups',
      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect against accidental deletion
    });

    // Common environment variables for all functions
    const commonEnv = {
      SESSION_BUCKET_NAME: sessionBucket.bucketName,
      SESSION_METADATA_TABLE_NAME: sessionMetadataTable.tableName,
      USER_METADATA_TABLE_NAME: userMetadataTable.tableName,
      JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-change-this',
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
      BLOCKED_USER_IDS: process.env.BLOCKED_USER_IDS || '',
    };

    // Session management functions
    const createSession = new lambda.Function(this, 'createSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'createSession.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const getSession = new lambda.Function(this, 'getSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'getSession.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const listSessions = new lambda.Function(this, 'listSessions', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'listSessions.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const discoverSessions = new lambda.Function(this, 'discoverSessions', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'discoverSessions.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const updateSessionMetadata = new lambda.Function(this, 'updateSessionMetadata', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'updateSessionMetadata.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const deleteSession = new lambda.Function(this, 'deleteSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'deleteSession.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    // OAuth functions
    const githubAuth = new lambda.Function(this, 'githubAuth', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'githubAuth.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const githubCallback = new lambda.Function(this, 'githubCallback', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'githubCallback.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const googleAuth = new lambda.Function(this, 'googleAuth', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'googleAuth.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const googleCallback = new lambda.Function(this, 'googleCallback', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'googleCallback.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const getUserWithPublicSessions = new lambda.Function(this, 'getUserWithPublicSessions', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'getUserWithPublicSessions.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const teamsEmailSignup = new lambda.Function(this, 'teamsEmailSignup', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'teamsEmailSignup.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    // API Gateway integrations
    const createSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'createSessionIntegration',
      createSession
    );

    const getSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'getSessionIntegration',
      getSession
    );

    const listSessionsIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'listSessionsIntegration',
      listSessions
    );

    const discoverSessionsIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'discoverSessionsIntegration',
      discoverSessions
    );

    const updateSessionMetadataIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'updateSessionMetadataIntegration',
      updateSessionMetadata
    );

    const deleteSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'deleteSessionIntegration',
      deleteSession
    );

    const githubAuthIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'githubAuthIntegration',
      githubAuth
    );

    const githubCallbackIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'githubCallbackIntegration',
      githubCallback
    );

    const googleAuthIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'googleAuthIntegration',
      googleAuth
    );

    const googleCallbackIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'googleCallbackIntegration',
      googleCallback
    );

    const getUserWithPublicSessionsIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'getUserWithPublicSessionsIntegration',
      getUserWithPublicSessions
    );

    const teamsEmailSignupIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'teamsEmailSignupIntegration',
      teamsEmailSignup
    );

    const httpApi = new apiGW.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apiGW.CorsHttpMethod.POST,
          apiGW.CorsHttpMethod.GET,
          apiGW.CorsHttpMethod.PUT,
          apiGW.CorsHttpMethod.DELETE,
          apiGW.CorsHttpMethod.OPTIONS
        ],
        allowOrigins: ['*'],
      },
    });

    // Create hosted zone for sessionbase.ai
    const hostedZone = new route53.HostedZone(this, 'SessionbaseHostedZone', {
      zoneName: 'sessionbase.ai',
    });

    // Create SSL certificate for api.sessionbase.ai
    const certificate = new certificateManager.Certificate(this, 'ApiCertificate', {
      domainName: 'api.sessionbase.ai',
      validation: certificateManager.CertificateValidation.fromDns(hostedZone),
    });

    // Create custom domain name for API Gateway
    const domainName = new apiGW.DomainName(this, 'ApiDomainName', {
      domainName: 'api.sessionbase.ai',
      certificate: certificate,
    });

    // Create API mapping
    new apiGW.ApiMapping(this, 'ApiMapping', {
      api: httpApi,
      domainName: domainName,
    });

    // Create A record pointing to the API Gateway custom domain
    new route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: 'api',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId
        )
      ),
    });

    // Add MX records for ImprovMX email forwarding
    new route53.MxRecord(this, 'ImprovMxRecord', {
      zone: hostedZone,
      values: [
        {
          hostName: 'mx1.improvmx.com',
          priority: 10,
        },
        {
          hostName: 'mx2.improvmx.com',
          priority: 20,
        },
      ],
    });

    // Add SPF TXT record for ImprovMX
    new route53.TxtRecord(this, 'ImprovSpfRecord', {
      zone: hostedZone,
      values: ['v=spf1 include:spf.improvmx.com ~all'],
    });

    // CNAME record for docs subdomain (Mintlify/Vercel)
    new route53.CnameRecord(this, 'DocsRecord', {
      zone: hostedZone,
      recordName: 'docs',
      domainName: 'cname.vercel-dns.com.',
    });

    // Session routes
    httpApi.addRoutes({
      path: '/sessions',
      methods: [apiGW.HttpMethod.POST],
      integration: createSessionIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions',
      methods: [apiGW.HttpMethod.GET],
      integration: listSessionsIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions/{id}',
      methods: [apiGW.HttpMethod.GET],
      integration: getSessionIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions/{id}/metadata',
      methods: [apiGW.HttpMethod.PUT],
      integration: updateSessionMetadataIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions/{id}',
      methods: [apiGW.HttpMethod.DELETE],
      integration: deleteSessionIntegration,
    });

    // Public discovery route
    httpApi.addRoutes({
      path: '/discover',
      methods: [apiGW.HttpMethod.GET],
      integration: discoverSessionsIntegration,
    });


    // OAuth routes
    httpApi.addRoutes({
      path: '/auth/github',
      methods: [apiGW.HttpMethod.GET],
      integration: githubAuthIntegration,
    });

    httpApi.addRoutes({
      path: '/auth/github/callback',
      methods: [apiGW.HttpMethod.GET],
      integration: githubCallbackIntegration,
    });

    httpApi.addRoutes({
      path: '/auth/google',
      methods: [apiGW.HttpMethod.GET],
      integration: googleAuthIntegration,
    });

    httpApi.addRoutes({
      path: '/auth/google/callback',
      methods: [apiGW.HttpMethod.GET],
      integration: googleCallbackIntegration,
    });

    // User routes
    httpApi.addRoutes({
      path: '/users/{id}',
      methods: [apiGW.HttpMethod.GET],
      integration: getUserWithPublicSessionsIntegration,
    });

    // Teams email signup route
    httpApi.addRoutes({
      path: '/teams/email-signup',
      methods: [apiGW.HttpMethod.POST],
      integration: teamsEmailSignupIntegration,
    });

    // Grant permissions
    sessionBucket.grantReadWrite(createSession);
    sessionBucket.grantRead(getSession);
    sessionBucket.grantDelete(deleteSession);

    // Grant DynamoDB permissions
    sessionMetadataTable.grantReadWriteData(createSession);
    sessionMetadataTable.grantReadData(getSession);
    sessionMetadataTable.grantReadData(listSessions);
    sessionMetadataTable.grantReadData(discoverSessions);
    sessionMetadataTable.grantReadWriteData(updateSessionMetadata);
    sessionMetadataTable.grantReadWriteData(deleteSession);

    // Grant user metadata table permissions
    userMetadataTable.grantReadWriteData(githubCallback);
    userMetadataTable.grantReadWriteData(googleCallback);
    userMetadataTable.grantReadData(getUserWithPublicSessions);

    // Grant session metadata table permissions for getUserWithPublicSessions
    sessionMetadataTable.grantReadData(getUserWithPublicSessions);

    // Grant teams email signups table permissions
    teamsEmailSignupsTable.grantReadWriteData(teamsEmailSignup);

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      description: 'The URL of the API Gateway',
    });

    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://api.sessionbase.ai`,
      description: 'The custom domain URL for your API',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: hostedZone.hostedZoneId,
      description: 'The Route 53 Hosted Zone ID for sessionbase.ai',
    });

    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers || []),
      description: 'Name servers to configure in GoDaddy',
    });
  }
}
