import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apiGW from 'aws-cdk-lib/aws-apigatewayv2';
import * as apiGWIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 buckets for sessions and users
    const sessionBucket = new s3.Bucket(this, 'sessionBucket');
    const userBucket = new s3.Bucket(this, 'userBucket');

    // Common environment variables for all functions
    const commonEnv = {
      SESSION_BUCKET_NAME: sessionBucket.bucketName,
      USER_BUCKET_NAME: userBucket.bucketName,
      JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-change-this',
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
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

    // Sharing functions
    const createShareLink = new lambda.Function(this, 'createShareLink', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'createShareLink.main',
      environment: commonEnv,
      code: lambda.Code.fromAsset(path.join(__dirname, 'session-lambdas')),
    });

    const getSharedSession = new lambda.Function(this, 'getSharedSession', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'getSharedSession.main',
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

    // API Gateway integrations
    const createSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'createSessionIntegration',
      createSession
    );

    const getSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'getSessionIntegration',
      getSession
    );

    const createShareLinkIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'createShareLinkIntegration',
      createShareLink
    );

    const getSharedSessionIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'getSharedSessionIntegration',
      getSharedSession
    );

    const githubAuthIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'githubAuthIntegration',
      githubAuth
    );

    const githubCallbackIntegration = new apiGWIntegrations.HttpLambdaIntegration(
      'githubCallbackIntegration',
      githubCallback
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

    // Session routes
    httpApi.addRoutes({
      path: '/sessions',
      methods: [apiGW.HttpMethod.POST],
      integration: createSessionIntegration,
    });

    httpApi.addRoutes({
      path: '/sessions/{id}',
      methods: [apiGW.HttpMethod.GET],
      integration: getSessionIntegration,
    });

    // Sharing routes
    httpApi.addRoutes({
      path: '/sessions/{id}/share',
      methods: [apiGW.HttpMethod.POST],
      integration: createShareLinkIntegration,
    });

    httpApi.addRoutes({
      path: '/shared/{token}',
      methods: [apiGW.HttpMethod.GET],
      integration: getSharedSessionIntegration,
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

    // Grant permissions
    sessionBucket.grantReadWrite(createSession);
    sessionBucket.grantRead(getSession);
    sessionBucket.grantRead(createShareLink);
    sessionBucket.grantRead(getSharedSession);
    userBucket.grantReadWrite(githubCallback);

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: httpApi.apiEndpoint,
      description: 'The URL of the API Gateway',
    });
  }
}
